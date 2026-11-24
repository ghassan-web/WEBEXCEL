import unittest
from datetime import date

from fastapi import HTTPException

from app.routers.master import (
    _auto_match_headers_for_sheet,
    _build_workflow_cedant_row,
    _build_os_mapping_profiles,
    _cedant_result_table_name,
    _delete_cedant_result_period,
    _extract_cedant_row,
    _extract_cedant_row_with_mapping,
    _has_cedant_result_values,
    _load_column_mapping,
    _master_raw_row_lookup_key,
    _build_mapping_version_profiles,
    _normalize_manual_mapping,
    _raw_primary_key,
    _replace_cedant_master_period,
    _write_cedant_rows,
    add_mapping_version,
    get_column_mappings,
    get_master_data,
)


class MasterRawRowLookupKeyTests(unittest.TestCase):
    def test_scopes_same_claim_to_its_upload_file_and_period(self):
        raw_rows = {
            _master_raw_row_lookup_key("LC011", "CLM-1", "Claims", "january.xlsx", 1, 2025): {
                "source": "January upload"
            },
            _master_raw_row_lookup_key("LC011", "CLM-1", "Claims", "february.xlsx", 2, 2025): {
                "source": "February upload"
            },
        }

        key = _master_raw_row_lookup_key(
            "LC011", "CLM-1", "Claims", "february.xlsx", 2, 2025
        )

        self.assertEqual(raw_rows[key]["source"], "February upload")


class RawPrimaryKeyTests(unittest.TestCase):
    def test_skipped_infopack_rows_do_not_shift_raw_row_keys(self):
        source_row = {"pk": "source-key", "data": {"Title": "Second row"}}
        rows_by_source_index = {1: {"title": "Second row"}}

        self.assertEqual(
            _raw_primary_key(source_row, 1, rows_by_source_index),
            "Second row",
        )

    def test_unmapped_raw_rows_keep_the_source_key(self):
        source_row = {"pk": "source-key", "data": {"Other": "value"}}

        self.assertEqual(_raw_primary_key(source_row, 0, {}), "source-key")


class CedantMasterWriteTests(unittest.TestCase):
    class FakeQuery:
        def __init__(self, rows):
            self.rows = rows

        def filter(self, *_args):
            return self

        def order_by(self, *_args):
            return self

        def all(self):
            return self.rows

    class FakeDatabase:
        def __init__(self, existing_rows):
            self.existing_rows = existing_rows
            self.executed = []

        def query(self, *_args):
            return CedantMasterWriteTests.FakeQuery(self.existing_rows)

        def execute(self, query, parameters=None):
            self.executed.append((str(query), parameters or {}))

    @staticmethod
    def row(month, outstanding):
        return {
            "cedant_code": "C001",
            "doc_no": "CLAIM-1",
            "dol": date(2025, 1, 2),
            "outstanding": outstanding,
            "currency": "USD",
            "month": month,
            "year": 2025,
            "file_name": "claims.xlsx",
            "sheet_name": "Claims",
        }

    def test_same_claim_and_period_replaces_existing_master_row(self):
        database = self.FakeDatabase([(7, "C001", "CLAIM-1", 1, 2025)])

        stats = _write_cedant_rows(database, [self.row(1, 250)])

        updates = [
            parameters
            for query, parameters in database.executed
            if query.startswith("UPDATE rekonsiliasi.master_os_cedant_web")
        ]
        inserts = [
            parameters
            for query, parameters in database.executed
            if query.startswith("INSERT INTO rekonsiliasi.master_os_cedant_web")
        ]
        self.assertEqual(stats, {"inserted": 0, "skipped": 0, "updated": 1})
        self.assertEqual(updates[0][0]["id"], 7)
        self.assertEqual(updates[0][0]["outstanding"], 250)
        self.assertEqual(inserts, [])

    def test_same_claim_in_new_period_is_appended(self):
        database = self.FakeDatabase([(7, "C001", "CLAIM-1", 1, 2025)])

        stats = _write_cedant_rows(database, [self.row(2, 250)])

        inserts = [
            parameters
            for query, parameters in database.executed
            if query.startswith("INSERT INTO rekonsiliasi.master_os_cedant_web")
        ]
        self.assertEqual(stats, {"inserted": 1, "skipped": 0, "updated": 0})
        self.assertEqual(inserts[0][0]["month"], 2)

    def test_first_upload_for_batch_replaces_all_rows_for_cedant_period(self):
        class FakeResult:
            rowcount = 3

            def scalar_one(self):
                return False

        class FakeDatabase:
            def __init__(self):
                self.executed = []

            def execute(self, query, parameters=None):
                query_text = str(query)
                self.executed.append((query_text, parameters or {}))
                return FakeResult()

        database = FakeDatabase()

        deleted = _replace_cedant_master_period(
            database,
            cedant_code="C001",
            month=1,
            year=2025,
            batch_id=10,
        )

        delete_query, delete_parameters = next(
            (query, parameters)
            for query, parameters in database.executed
            if query.startswith("DELETE FROM rekonsiliasi.master_os_cedant_web")
        )
        self.assertEqual(deleted, (3, True))
        self.assertIn("AND month = :month AND year = :year", delete_query)
        self.assertEqual(
            delete_parameters,
            {"cedant_code": "C001", "month": 1, "year": 2025},
        )

    def test_later_sheet_in_same_batch_does_not_replace_period_again(self):
        class FakeResult:
            rowcount = 3

            def scalar_one(self):
                return True

        class FakeDatabase:
            def __init__(self):
                self.executed = []

            def execute(self, query, parameters=None):
                query_text = str(query)
                self.executed.append((query_text, parameters or {}))
                return FakeResult()

        database = FakeDatabase()

        deleted = _replace_cedant_master_period(
            database,
            cedant_code="C001",
            month=1,
            year=2025,
            batch_id=10,
        )

        self.assertEqual(deleted, (0, False))
        self.assertFalse(
            any(
                query.startswith("DELETE FROM rekonsiliasi.master_os_cedant_web")
                for query, _ in database.executed
            )
        )

    def test_result_table_replacement_is_scoped_to_cedant_and_period(self):
        class FakePreparer:
            def quote(self, identifier):
                return f'"{identifier}"'

        class FakeDialect:
            identifier_preparer = FakePreparer()

        class FakeBind:
            dialect = FakeDialect()

        class FakeResult:
            rowcount = 14

        class FakeDatabase:
            def __init__(self):
                self.executed = []

            def get_bind(self):
                return FakeBind()

            def execute(self, query, parameters=None):
                self.executed.append((str(query), parameters or {}))
                return FakeResult()

        database = FakeDatabase()

        deleted = _delete_cedant_result_period(
            database,
            table_name="os_claim_cedant_aca",
            cedant_code="9A011",
            month=1,
            year=2025,
        )

        query, parameters = database.executed[0]
        self.assertEqual(deleted, 14)
        self.assertIn('DELETE FROM hasil_rekonsiliasi."os_claim_cedant_aca"', query)
        self.assertIn("reporting_month = :month", query)
        self.assertIn("reporting_year = :year", query)
        self.assertEqual(
            parameters,
            {"cedant_code": "9A011", "month": 1, "year": 2025},
        )


class CedantRowExtractionTests(unittest.TestCase):
    def test_auto_mapping_recognizes_claim_reference_and_incident_date_headers(self):
        self.assertEqual(
            _auto_match_headers_for_sheet(
                ["Claim Reference", "Date of Incident"], False, {}
            ),
            {"doc_no": "Claim Reference", "dol": "Date of Incident"},
        )

    def test_mapped_extractor_finds_reference_and_date_when_mapping_is_incomplete(self):
        row = _extract_cedant_row_with_mapping(
            {
                "pk": "2026-09-06",
                "data": {
                    "Claim Reference": "PNC-118424",
                    "Date of Incident": "2026-09-06",
                    "Net OS": "100",
                },
            },
            "C001",
            "9",
            "2026",
            "claims.xlsx",
            "Claims",
            {"outstanding": "Net OS"},
        )

        self.assertEqual(row["doc_no"], "PNC-118424")
        self.assertEqual(row["dol"], date(2026, 9, 6))

    def test_unmapped_extractor_does_not_store_loss_date_as_document_number(self):
        row = _extract_cedant_row(
            {
                "pk": "2026-09-06",
                "data": {
                    "Claim Reference": "PNC-118424",
                    "Date of Incident": "2026-09-06",
                },
            },
            "C001",
            "9",
            "2026",
            "claims.xlsx",
            "Claims",
        )

        self.assertEqual(row["doc_no"], "PNC-118424")
        self.assertEqual(row["dol"], date(2026, 9, 6))

    def test_workflow_extractor_falls_back_to_reference_and_date_headers(self):
        row = _build_workflow_cedant_row(
            {
                "Claim Reference": "20260906",
                "Date of Incident": "2026-09-06",
            },
            {},
            {
                "cedant_code": "C001",
                "reporting_month": 9,
                "reporting_year": 2026,
                "file_name": "claims.xlsx",
                "sheet_name": "Claims",
            },
        )

        self.assertEqual(row["doc_no"], "20260906")
        self.assertEqual(row["dol"], date(2026, 9, 6))


class CedantResultTableNameTests(unittest.TestCase):
    def test_builds_table_name_from_cedant_short_name(self):
        self.assertEqual(_cedant_result_table_name("ACA"), "os_claim_cedant_aca")
        self.assertEqual(
            _cedant_result_table_name("AON B INA"),
            "os_claim_cedant_aon_b_ina",
        )

    def test_rejects_empty_or_overlong_table_names(self):
        for short_name in ("", "A" * 60):
            with self.subTest(short_name=short_name):
                with self.assertRaises(HTTPException) as raised:
                    _cedant_result_table_name(short_name)

                self.assertEqual(raised.exception.status_code, 422)


class WorkflowCedantValidationTests(unittest.TestCase):
    def test_keeps_mapped_row_without_loss_ref_when_outstanding_is_valid(self):
        self.assertTrue(
            _has_cedant_result_values(
                {"doc_no": None, "dol": None, "outstanding": 100, "currency": None}
            )
        )

    def test_skips_rows_without_any_valid_mapped_result_value(self):
        self.assertFalse(
            _has_cedant_result_values(
                {"doc_no": None, "dol": None, "outstanding": None, "currency": None}
            )
        )


class CedantMappingProfileTests(unittest.TestCase):
    def test_database_dataset_type_keeps_os_insured_mapping_in_os_profiles(self):
        os_rows = [
            {
                "cedant_code": "LC011",
                "cedant_name": "ACA",
                "excel_name": "DocNo",
                "field_name": "loss_ref",
                "dataset_type": "OS CEDANT",
                "mapping_version": 1,
                "argument": {},
            },
            {
                "cedant_code": "LC011",
                "cedant_name": "ACA",
                "excel_name": "Amount_Net_OS",
                "field_name": "outstanding",
                "dataset_type": "OS CEDANT",
                "mapping_version": 1,
                "argument": {},
            },
            {
                "cedant_code": "LC011",
                "cedant_name": "ACA",
                "excel_name": "Name_TTG",
                "field_name": "insured",
                "dataset_type": "OS CEDANT",
                "mapping_version": 1,
                "argument": {},
            },
        ]

        class FakeResult:
            def __init__(self, rows):
                self.rows = rows

            def mappings(self):
                return self

            def all(self):
                return self.rows

        class FakeDatabase:
            def execute(self, query, *_args, **_kwargs):
                query_text = str(query)
                if "master_mapping_column" in query_text:
                    return FakeResult(os_rows)
                if "master_field" in query_text:
                    return FakeResult(
                        [
                            {
                                "field_name": field,
                                "dataset_type": "OS CEDANT",
                                "default_source": "column",
                            }
                            for field in ("loss_ref", "outstanding", "dol")
                        ]
                    )
                if "upload_table" in query_text:
                    return FakeResult([])
                return FakeResult(
                    [{"cedant_code": "LC011", "cedant_name": "ACA"}]
                )

        result = get_column_mappings(FakeDatabase())
        os_profiles = [
            profile
            for profile in result["profiles"]
            if profile["tipe_data"] == "OS Cedant"
        ]
        infopack_profiles = [
            profile
            for profile in result["profiles"]
            if profile["tipe_data"] == "Infopack"
        ]

        self.assertEqual(len(os_profiles), 1)
        self.assertEqual(os_profiles[0]["mapping"]["title"], "Name_TTG")
        self.assertEqual(infopack_profiles, [])
        self.assertEqual(
            result["mapping_versions"][0]["mapping"],
            {
                "doc_no": "DocNo",
                "outstanding": "Amount_Net_OS",
                "title": "Name_TTG",
            },
        )
        self.assertIn(
            {"field_name": "doc_no", "dataset_type": "OS Cedant"},
            result["mapping_fields"],
        )

    def test_mapping_version_profiles_keep_each_sheet_and_version(self):
        rows = [
            {
                "cedant_code": "LC011",
                "cedant_name": "ACA",
                "excel_name": header,
                "field_name": field,
                "dataset_type": "OS CEDANT",
                "mapping_version": version,
                "argument": {"sheet_names": ["Claims"]},
            }
            for version, field, header in (
                (1, "loss_ref", "DocNo"),
                (1, "outstanding", "Net OS"),
                (2, "loss_ref", "RefNo"),
            )
        ]

        profiles = _build_mapping_version_profiles(rows)

        self.assertEqual([profile["mappingVersion"] for profile in profiles], [1, 2])
        self.assertEqual(profiles[0]["mapping"]["doc_no"], "DocNo")
        self.assertEqual(profiles[1]["mapping"]["doc_no"], "RefNo")
        self.assertEqual(profiles[0]["sheetNames"], ["Claims"])

    def test_manual_mapping_accepts_catalog_alias_and_rejects_unknown_fields(self):
        catalog = [
            {"field_name": "loss_ref", "default_source": "column"},
            {"field_name": "outstanding", "default_source": "column"},
            {"field_name": "file_name", "default_source": "file_metadata"},
        ]

        self.assertEqual(
            _normalize_manual_mapping(
                {"doc_no": "Claim Ref", "outstanding": "Net OS"},
                catalog,
            ),
            {"doc_no": "Claim Ref", "outstanding": "Net OS"},
        )
        with self.assertRaises(HTTPException) as raised:
            _normalize_manual_mapping({"unknown": "Header"}, catalog)
        self.assertEqual(raised.exception.status_code, 422)

    def test_add_mapping_version_inserts_a_complete_snapshot_with_next_version(self):
        catalog = [
            {
                "field_id": 41,
                "field_name": "loss_ref",
                "default_source": "column",
            },
            {
                "field_id": 42,
                "field_name": "outstanding",
                "default_source": "column",
            },
        ]

        class FakeResult:
            def __init__(self, rows=None, scalar_value=None):
                self.rows = rows or []
                self.scalar_value = scalar_value

            def first(self):
                return self.rows[0] if self.rows else None

            def mappings(self):
                return self

            def __iter__(self):
                return iter(self.rows)

            def scalar(self):
                return self.scalar_value

        class FakeDatabase:
            def __init__(self):
                self.inserted = []
                self.committed = False
                self.rolled_back = False

            def execute(self, query, parameters=None):
                query_text = str(query)
                if "SELECT cedant_code FROM rekonsiliasi.master_oscedant_code" in query_text:
                    return FakeResult([("LC011",)])
                if "SELECT field_id, field_name" in query_text:
                    return FakeResult(catalog)
                if "SELECT MAX(m.mapping_version)" in query_text:
                    return FakeResult(scalar_value=4)
                if "SELECT MAX(t.mapping_version)" in query_text:
                    return FakeResult(scalar_value=6)
                if "INSERT INTO rekonsiliasi.master_mapping_column" in query_text:
                    self.inserted.extend(parameters)
                return FakeResult()

            def commit(self):
                self.committed = True

            def rollback(self):
                self.rolled_back = True

        database = FakeDatabase()
        result = add_mapping_version(
            {
                "cedant_code": "LC011",
                "dataset_type": "OS Cedant",
                "sheet_names": ["Claims"],
                "mapping": {
                    "doc_no": "Claim Ref",
                    "outstanding": "Net OS",
                },
            },
            database,
            "session-1",
        )

        self.assertEqual(result["mapping_version"], 7)
        self.assertEqual(len(database.inserted), 2)
        self.assertEqual(
            {row["field_id"] for row in database.inserted},
            {41, 42},
        )
        self.assertEqual(
            {row["argument"] for row in database.inserted},
            {'{"sheet_names": ["Claims"]}'},
        )
        self.assertTrue(database.committed)
        self.assertFalse(database.rolled_back)


class MasterDataFilteringTests(unittest.TestCase):
    class FakeResult:
        def scalar(self):
            return 0

        def mappings(self):
            return self

        def all(self):
            return []

    class FakeQuery:
        def filter(self, *_args):
            return self

        def order_by(self, *_args):
            return self

        def limit(self, *_args):
            return self

        def all(self):
            return []

    class FakeDatabase:
        def __init__(self):
            self.executed = []

        def execute(self, query, parameters=None):
            self.executed.append((str(query), parameters or {}))
            return MasterDataFilteringTests.FakeResult()

        def query(self, *_args):
            return MasterDataFilteringTests.FakeQuery()

    def test_os_core_filters_are_applied_in_database_query(self):
        database = self.FakeDatabase()

        result = get_master_data(
            tipe_data="OS Cedant",
            cedant=None,
            search=None,
            loss_ref="DLA",
            cedant_code="LA059",
            cedant_name="Asuransi",
            dol="2025",
            currency="IDR",
            outstanding="4500",
            skip=0,
            limit=50,
            db=database,
            session_id="session-1",
        )

        query, parameters = database.executed[0]
        self.assertEqual(result["total"], 0)
        for field in (
            "filter_doc_no",
            "filter_cedant_code",
            "filter_cedant_name",
            "filter_dol",
            "filter_currency",
            "filter_outstanding",
        ):
            self.assertIn(field, parameters)
            self.assertIn(f":{field}", query)
        self.assertIn("AS cedant_name", database.executed[1][0])

    def test_infopack_core_filters_are_applied_in_database_query(self):
        database = self.FakeDatabase()

        get_master_data(
            tipe_data="Infopack",
            cedant=None,
            search=None,
            loss_ref=None,
            cedant_code=None,
            cedant_name=None,
            currency=None,
            outstanding=None,
            class_code="Property",
            title="Insured",
            value="1000",
            sheet_name="Claims",
            period="9/2025",
            dol="2025-01",
            cob="Property",
            gross="5000",
            tsi="7000",
            skip=0,
            limit=50,
            db=database,
            session_id="session-1",
        )

        query, parameters = database.executed[0]
        for field in (
            "filter_class_code",
            "filter_title",
            "filter_value",
            "filter_sheet_name",
            "filter_period",
            "filter_dol",
            "filter_cob",
            "filter_gross",
            "filter_tsi",
        ):
            self.assertIn(field, parameters)
            self.assertIn(f":{field}", query)

    def test_profiles_choose_one_complete_version_per_sheet_without_merging_old_rules(self):
        def rule(version, field, header, sheet):
            return {
                "dataset_type": "OS CEDANT",
                "cedant_code": "LC011",
                "cedant_name": "ACA",
                "mapping_version": version,
                "field_name": field,
                "excel_name": header,
                "argument": {"sheet_names": [sheet]},
            }

        rows = [
            rule(1, "loss_ref", "Old Ref", "Claims"),
            rule(1, "outstanding", "Old OS", "Claims"),
            rule(1, "dol", "Old DOL", "Claims"),
            rule(1, "currency", "Old Currency", "Claims"),
            rule(1, "loss_ref", "Old Ref", "Legacy"),
            rule(1, "outstanding", "Old OS", "Legacy"),
            rule(1, "dol", "Old DOL", "Legacy"),
            rule(1, "currency", "Old Currency", "Legacy"),
            rule(2, "loss_ref", "New Ref", "Claims"),
            rule(2, "outstanding", "New OS", "Claims"),
        ]

        profiles = _build_os_mapping_profiles(rows)

        claims = next(profile for profile in profiles if profile["sheetNames"] == ["Claims"])
        legacy = next(profile for profile in profiles if profile["sheetNames"] == ["Legacy"])
        self.assertEqual(claims["mappingVersion"], 2)
        self.assertEqual(claims["mapping"], {"doc_no": "New Ref", "outstanding": "New OS"})
        self.assertEqual(legacy["mappingVersion"], 1)
        self.assertEqual(legacy["mapping"]["currency"], "Old Currency")

    def test_column_mapping_loads_a_single_applicable_version(self):
        class FakeResult:
            def __init__(self, rows):
                self.rows = rows

            def mappings(self):
                return self

            def all(self):
                return self.rows

        class FakeDatabase:
            def execute(self, *_args, **_kwargs):
                return FakeResult(
                    [
                        {
                            "excel_name": "New Ref",
                            "field_name": "loss_ref",
                            "mapping_version": 2,
                            "argument": {"sheet_names": ["Claims"]},
                        },
                        {
                            "excel_name": "New OS",
                            "field_name": "outstanding",
                            "mapping_version": 2,
                            "argument": {"sheet_names": ["Claims"]},
                        },
                        {
                            "excel_name": "Old Currency",
                            "field_name": "currency",
                            "mapping_version": 1,
                            "argument": {"sheet_names": ["Claims"]},
                        },
                    ]
                )

        self.assertEqual(
            _load_column_mapping(FakeDatabase(), "LC011", "Claims", False),
            {"doc_no": "New Ref", "outstanding": "New OS"},
        )

    def test_column_mapping_falls_back_to_confirmed_upload_history(self):
        class FakeResult:
            def __init__(self, rows):
                self.rows = rows

            def mappings(self):
                return self

            def all(self):
                return self.rows

        class FakeDatabase:
            def execute(self, query, *_args, **_kwargs):
                if "master_mapping_column" in str(query):
                    return FakeResult([])
                return FakeResult(
                    [
                        {
                            "mapping_version": 2,
                            "applied_mapping": {
                                "mapping": {
                                    "loss_ref": "Claim Ref",
                                    "outstanding": "OS Amount",
                                    "dol": "Loss Date",
                                }
                            },
                        }
                    ]
                )

        self.assertEqual(
            _load_column_mapping(FakeDatabase(), "LC011", "Claims", False),
            {
                "doc_no": "Claim Ref",
                "outstanding": "OS Amount",
                "dol": "Loss Date",
            },
        )


if __name__ == "__main__":
    unittest.main()
