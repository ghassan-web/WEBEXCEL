import unittest
from datetime import date
from decimal import Decimal
from unittest.mock import patch

from fastapi import HTTPException

from app.routers.master import (
    _auto_mapping_for_catalog,
    _auto_confirm_mapped_sheets,
    _auto_match_headers_for_sheet,
    _build_workflow_cedant_row,
    _build_os_mapping_profiles,
    _cedant_result_table_name,
    _delete_cedant_result_period,
    _extract_cedant_row,
    _extract_cedant_row_with_mapping,
    _has_cedant_result_values,
    _load_column_mapping,
    _build_mapping_version_profiles,
    _normalize_manual_mapping,
    _master_raw_row_lookup_key,
    _library_pending_sheets,
    _parse_dol,
    _raw_primary_key,
    _replace_cedant_master_period,
    _write_cedant_rows,
    _write_cedant_result_rows,
    add_mapping_version,
    get_column_mappings,
    get_master_data,
    skip_upload_table,
)


class DolParsingTests(unittest.TestCase):
    def test_extracts_date_from_aon_trans_desc_dol_value(self):
        self.assertEqual(
            _parse_dol("PT Buana Megah / DOL 28/04/2021"),
            date(2021, 4, 28),
        )

    def test_parses_aon_dol_with_dashes(self):
        self.assertEqual(
            _parse_dol("PT Gokak Indonesia / DOL 29-12-2023"),
            date(2023, 12, 29),
        )

    def test_extracts_date_when_description_has_no_dol_label(self):
        self.assertEqual(
            _parse_dol("5/27/2024, CV Mandiri Sejahtera Indonesia"),
            date(2024, 5, 27),
        )

    def test_extracts_month_name_date_from_description(self):
        self.assertEqual(
            _parse_dol("Reinstatement @ 17-Jan-24"),
            date(2024, 1, 17),
        )


class AutoConfirmMappedSheetsTests(unittest.TestCase):
    def test_attempts_each_complete_sheet_and_keeps_failures_for_review(self):
        sheets = [
            {
                "table_id": 1,
                "status": "needs_review",
                "mapping_complete": True,
                "suggested_mapping": {"loss_ref": "Claim"},
            },
            {
                "table_id": 2,
                "status": "needs_review",
                "mapping_complete": False,
                "suggested_mapping": {},
            },
            {
                "table_id": 3,
                "status": "skipped",
                "mapping_complete": True,
                "suggested_mapping": {"loss_ref": "Claim"},
            },
            {
                "table_id": 4,
                "status": "needs_review",
                "mapping_complete": True,
                "suggested_mapping": {"loss_ref": "Claim"},
            },
        ]
        confirmed = {
            "mapping_version": 8,
            "rows_appended": 2,
            "rows_updated": 1,
            "rows_skipped": 0,
        }

        with patch(
            "app.routers.master.confirm_upload_table_mapping",
            side_effect=[confirmed, HTTPException(status_code=422, detail="Invalid row")],
        ) as confirm:
            _auto_confirm_mapped_sheets(None, "session-1", sheets)

        self.assertEqual([call.args[0] for call in confirm.call_args_list], [1, 4])
        self.assertEqual(sheets[0]["status"], "ready")
        self.assertEqual(sheets[0]["rows_appended"], 2)
        self.assertEqual(sheets[1]["status"], "needs_review")
        self.assertEqual(sheets[2]["status"], "skipped")
        self.assertEqual(sheets[3]["status"], "needs_review")
        self.assertEqual(sheets[3]["error_message"], "Invalid row")


class MappingRulePrecedenceTests(unittest.TestCase):
    def test_auto_match_does_not_guess_when_rule_header_is_missing(self):
        mapping = _auto_match_headers_for_sheet(
            ["Policy No", "ORC AMT"],
            False,
            {"doc_no": "Invoice No", "outstanding": "ORC AMT"},
        )

        self.assertNotIn("doc_no", mapping)
        self.assertEqual(mapping["outstanding"], "ORC AMT")

    def test_prepare_keeps_loss_ref_unmapped_when_rule_header_is_missing(self):
        mapping = _auto_mapping_for_catalog(
            ["Policy No"],
            "OS CEDANT",
            [{"field_name": "loss_ref", "default_source": "column"}],
            protected_fields={"loss_ref"},
        )

        self.assertNotIn("loss_ref", mapping)

    def test_prepare_uses_rule_header_when_present(self):
        mapping = _auto_mapping_for_catalog(
            ["Invoice No", "Policy No"],
            "OS CEDANT",
            [{"field_name": "loss_ref", "default_source": "column"}],
            {"loss_ref": "INVOICE NO"},
            {"loss_ref"},
        )

        self.assertEqual(mapping["loss_ref"], "Invoice No")


class LibraryPendingSheetsTests(unittest.TestCase):
    def test_groups_only_pending_sheets_for_requested_jobs(self):
        class FakeRows:
            def mappings(self):
                return self

            def all(self):
                return [
                    {
                        "job_id": 12,
                        "table_id": 121,
                        "sheet_name": "Claims",
                        "error_message": None,
                    },
                    {
                        "job_id": 99,
                        "table_id": 991,
                        "sheet_name": "Other session",
                        "error_message": None,
                    },
                    {
                        "job_id": 12,
                        "table_id": 122,
                        "sheet_name": "Summary",
                        "error_message": "Mapping belum lengkap",
                    },
                ]

            def __iter__(self):
                return iter(self.all())

        class FakeDatabase:
            def execute(self, query, params):
                self.params = params
                return FakeRows()

        database = FakeDatabase()
        result = _library_pending_sheets(database, "session-1", [12])

        self.assertEqual(database.params["session_id"], "session-1")
        self.assertEqual(
            result,
            {
                12: [
                    {
                        "table_id": 121,
                        "sheet_name": "Claims",
                        "error_message": None,
                    },
                    {
                        "table_id": 122,
                        "sheet_name": "Summary",
                        "error_message": "Mapping belum lengkap",
                    },
                ]
            },
        )


class UploadTableSkipTests(unittest.TestCase):
    def test_skipping_last_pending_sheet_completes_its_batch_and_job(self):
        context = {
            "table_id": 12,
            "batch_id": 7,
            "table_status": "needs_review",
            "batch_status": "needs_review",
            "applied_mapping": {"mapping": {}, "__job_id": 3},
        }

        class FakeResult:
            def __init__(self, row=None, scalar_value=None):
                self.row = row
                self.scalar_value = scalar_value

            def mappings(self):
                return self

            def first(self):
                return self.row

            def scalar_one(self):
                return self.scalar_value

        class FakeJob:
            status = "processing"

        class FakeDatabase:
            def __init__(self):
                self.statements = []
                self.job = FakeJob()
                self.committed = False

            def execute(self, query, parameters=None):
                query_text = str(query)
                self.statements.append((query_text, parameters))
                if "SELECT t.table_id, t.batch_id" in query_text:
                    return FakeResult(row=context)
                if "SELECT COUNT(*) FROM rekonsiliasi.upload_table" in query_text:
                    return FakeResult(scalar_value=0)
                return FakeResult()

            def get(self, _model, _job_id):
                return self.job

            def commit(self):
                self.committed = True

            def rollback(self):
                raise AssertionError("Unexpected rollback")

        database = FakeDatabase()

        result = skip_upload_table(12, database, "session-1")

        self.assertEqual(result["status"], "skipped")
        self.assertEqual(result["batch_status"], "ready")
        self.assertEqual(database.job.status, "done")
        self.assertTrue(database.committed)
        self.assertTrue(
            any(
                "SET status = 'skipped'" in query
                for query, _ in database.statements
            )
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
            master_table="master_os_infopack_web",
        )

        self.assertEqual(deleted, (0, False))
        self.assertFalse(
            any(
                query.startswith("DELETE FROM rekonsiliasi.master_os_infopack_web")
                for query, _ in database.executed
            )
        )

    def test_infopack_master_replacement_is_scoped_to_cedant_and_period(self):
        class FakeResult:
            rowcount = 8

            def scalar_one(self):
                return False

        class FakeDatabase:
            def __init__(self):
                self.executed = []

            def execute(self, query, parameters=None):
                self.executed.append((str(query), parameters or {}))
                return FakeResult()

        database = FakeDatabase()

        deleted = _replace_cedant_master_period(
            database,
            cedant_code="C001",
            month=1,
            year=2025,
            batch_id=10,
            master_table="master_os_infopack_web",
        )

        delete_query, delete_parameters = next(
            (query, parameters)
            for query, parameters in database.executed
            if query.startswith("DELETE FROM rekonsiliasi.master_os_infopack_web")
        )
        self.assertEqual(deleted, (8, True))
        self.assertIn("AND month = :month AND year = :year", delete_query)
        self.assertEqual(
            delete_parameters,
            {"cedant_code": "C001", "month": 1, "year": 2025},
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
        self.assertEqual(
            _cedant_result_table_name("ACA", "INFOPACK"),
            "os_claim_infopack_aca",
        )
        self.assertEqual(
            _cedant_result_table_name("AON B INA", "INFOPACK"),
            "os_claim_infopack_aon_b_ina",
        )

    def test_rejects_empty_or_overlong_table_names(self):
        for short_name in ("", "A" * 60):
            with self.subTest(short_name=short_name):
                with self.assertRaises(HTTPException) as raised:
                    _cedant_result_table_name(short_name)

                self.assertEqual(raised.exception.status_code, 422)


class InfopackResultTableWriteTests(unittest.TestCase):
    def test_writes_info_pack_fields_to_a_separate_cedant_result_table(self):
        class FakePreparer:
            @staticmethod
            def quote(identifier):
                return f'"{identifier}"'

        class FakeDialect:
            identifier_preparer = FakePreparer()

        class FakeBind:
            dialect = FakeDialect()

        class FakeResult:
            def __init__(self, *, scalar=None, rows=(), rowcount=1):
                self._scalar = scalar
                self._rows = rows
                self.rowcount = rowcount

            def scalar(self):
                return self._scalar

            def all(self):
                return self._rows

        result_columns = (
            "id", "cedant_code", "class_code", "upload_table_id",
            "excel_row_number", "reporting_month", "reporting_year",
            "file_name", "sheet_name", "created_at", "Claim Ref", "DOL",
            "Gross Amount", "COB", "Surplus OS", "Eff_Date", "Exp_Date",
        )

        class FakeDatabase:
            def __init__(self):
                self.executed = []

            def get_bind(self):
                return FakeBind()

            def execute(self, query, parameters=None):
                query_text = str(query)
                self.executed.append((query_text, parameters or {}))
                if "SELECT cedant_short_name" in query_text:
                    return FakeResult(scalar="ACA")
                if "SELECT column_name FROM information_schema.columns" in query_text:
                    return FakeResult(rows=[(column,) for column in result_columns])
                return FakeResult(rowcount=1)

        database = FakeDatabase()
        mapping = {
            "loss_ref": "Claim Ref",
            "class_code": "Class Code",
            "dol": "DOL",
            "gross": "Gross Amount",
            "surplus_outstanding": "Surplus OS",
            "policy_comm_date": "Eff_Date",
            "policy_expiry_date": "Exp_Date",
        }
        result_mapping = {
            field: header
            for field, header in mapping.items()
            if field != "class_code"
        }
        source_data = {
            "Claim Ref": "CLM-123",
            "Class Code": "FORM-CODE",
            "DOL": "14/03/2025",
            "Gross Amount": "100.00",
            "Surplus OS": "60.00",
            "Eff_Date": "2021-02-18 00:00:00",
            "Exp_Date": "",
        }
        normalized = {
            "class_code": "FORM-CODE",
            "cob": "ALL BUSINESS",
            "dol": date(2025, 3, 14),
            "gross": Decimal("100.00"),
            "surplus_outstanding": Decimal("60.00"),
        }

        with (
            patch(
                "app.routers.master.resolve_result_columns",
                return_value=result_mapping,
            ) as resolve_columns,
            patch("app.routers.master.ensure_result_table"),
        ):
            table_name, inserted, replaced = _write_cedant_result_rows(
                database,
                cedant_code="C001",
                table_id=22,
                month=3,
                year=2025,
                file_name="infopack.xlsx",
                sheet_name="Claims",
                mapping=mapping,
                catalog=[
                    {"field_name": "policy_comm_date", "data_type": "date"},
                    {"field_name": "policy_expiry_date", "data_type": "date"},
                ],
                rows=[(source_data, normalized, 2)],
                replace_period=True,
                dataset_type="INFOPACK",
            )

        self.assertEqual(table_name, "os_claim_infopack_aca")
        self.assertEqual((inserted, replaced), (1, 1))
        resolve_columns.assert_called_once()
        self.assertEqual(
            resolve_columns.call_args.kwargs["dataset_type"],
            "INFOPACK",
        )
        self.assertNotIn("cob", resolve_columns.call_args.kwargs["mapping"])
        self.assertEqual(
            resolve_columns.call_args.kwargs["mapping"]["class_code"],
            "Class Code",
        )
        insert_sql, parameters = database.executed[-1]
        self.assertIn('hasil_rekonsiliasi."os_claim_infopack_aca"', insert_sql)
        delete_query, delete_parameters = next(
            (query, parameters)
            for query, parameters in database.executed
            if query.startswith("DELETE FROM hasil_rekonsiliasi.")
        )
        self.assertIn("reporting_month = :month", delete_query)
        self.assertIn("reporting_year = :year", delete_query)
        self.assertEqual(
            delete_parameters,
            {"cedant_code": "C001", "month": 3, "year": 2025},
        )
        row = parameters[0]
        self.assertEqual(row["value_1"], "FORM-CODE")
        self.assertEqual(row["value_4"], "CLM-123")
        self.assertEqual(row["value_5"], date(2025, 3, 14))
        self.assertEqual(row["value_6"], Decimal("100.00"))
        self.assertEqual(row["value_7"], Decimal("60.00"))
        self.assertEqual(row["value_8"], date(2021, 2, 18))
        self.assertIsNone(row["value_9"])
        self.assertNotIn('"COB"', insert_sql)


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
    def test_infopack_mapping_loader_reads_its_dedicated_table(self):
        class FakeResult:
            def __init__(self, rows=None):
                self.rows = rows or []

            def mappings(self):
                return self

            def all(self):
                return self.rows

        class FakeDatabase:
            def __init__(self):
                self.queries = []

            def execute(self, query, *_args, **_kwargs):
                query_text = str(query)
                self.queries.append(query_text)
                if "master_mapping_column_infopack" in query_text:
                    return FakeResult(
                        [
                            {
                                "excel_name": "Claim Reference",
                                "field_name": "loss_ref",
                                "argument": {"sheet_names": ["Claims"]},
                                "mapping_version": 2,
                            },
                            {
                                "excel_name": "Insured Name",
                                "field_name": "insured",
                                "argument": {"sheet_names": ["Claims"]},
                                "mapping_version": 2,
                            },
                            {
                                "excel_name": "Gross Amount",
                                "field_name": "gross",
                                "argument": {"sheet_names": ["Claims"]},
                                "mapping_version": 2,
                            }
                        ]
                    )
                return FakeResult()

        database = FakeDatabase()

        result = _load_column_mapping(database, "LC011", "Claims", True)

        self.assertEqual(result["loss_ref"], "Claim Reference")
        self.assertEqual(result["insured"], "Insured Name")
        self.assertEqual(result["gross"], "Gross Amount")
        self.assertTrue(
            any("FROM rekonsiliasi.master_mapping_column_infopack" in query
                for query in database.queries)
        )

    def test_infopack_mapping_loader_does_not_mix_older_versions(self):
        class FakeResult:
            def mappings(self):
                return self

            def all(self):
                return [
                    {
                        "excel_name": "Old Insured",
                        "field_name": "insured",
                        "argument": {},
                        "mapping_version": 1,
                    },
                    {
                        "excel_name": "Claim No.",
                        "field_name": "loss_ref",
                        "argument": {},
                        "mapping_version": 3,
                    },
                ]

        class EmptyResult:
            def mappings(self):
                return self

            def all(self):
                return []

        class FakeDatabase:
            def execute(self, query, *_args, **_kwargs):
                if "master_mapping_column_infopack" in str(query):
                    return FakeResult()
                return EmptyResult()

        result = _load_column_mapping(FakeDatabase(), "LC011", "Claims", True)

        self.assertEqual(result, {"loss_ref": "Claim No."})

    def test_infopack_mapping_loader_selects_active_source_for_file_and_sheet(self):
        source_rows = [
            {
                "excel_name": "Proportional Claim",
                "field_name": "loss_ref",
                "argument": {
                    "source_tables": [
                        {
                            "file_name": "InfoPack_Proportional.xlsx",
                            "sheet_name": "List of big loss",
                        }
                    ]
                },
                "mapping_version": 1,
            },
            {
                "excel_name": "XOL 2024 Claim",
                "field_name": "loss_ref",
                "argument": {
                    "source_tables": [
                        {
                            "file_name": "InfoPack_XOL_2024.xlsx",
                            "sheet_name": "LIST BIG LOSS",
                        }
                    ]
                },
                "mapping_version": 2,
            },
            {
                "excel_name": "XOL 2025 Claim",
                "field_name": "loss_ref",
                "argument": {
                    "source_tables": [
                        {
                            "file_name": "InfoPack_XOL_2025.xlsx",
                            "sheet_name": "LIST INDIVIDUAL",
                        }
                    ]
                },
                "mapping_version": 3,
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
                if "master_mapping_column_infopack" in str(query):
                    return FakeResult(source_rows)
                return FakeResult([])

        database = FakeDatabase()
        self.assertEqual(
            _load_column_mapping(
                database,
                "LB003",
                "LIST BIG LOSS",
                True,
                "InfoPack_XOL_2024.xlsx",
            ),
            {"loss_ref": "XOL 2024 Claim"},
        )
        self.assertEqual(
            _load_column_mapping(
                database,
                "LB003",
                "LIST INDIVIDUAL",
                True,
                "InfoPack_XOL_2025.xlsx",
            ),
            {"loss_ref": "XOL 2025 Claim"},
        )
        self.assertEqual(
            _load_column_mapping(
                database,
                "LB003",
                "List of big loss",
                True,
                "InfoPack_Proportional.xlsx",
            ),
            {"loss_ref": "Proportional Claim"},
        )
        ambiguous_rows = [
            {
                "excel_name": "Old Claim",
                "field_name": "loss_ref",
                "argument": {
                    "source_tables": [
                        {
                            "file_name": "InfoPack_Proportional.xlsx",
                            "sheet_name": "LIST BIG LOSS",
                        }
                    ]
                },
                "mapping_version": 1,
            },
            {
                "excel_name": "XOL Claim",
                "field_name": "loss_ref",
                "argument": {
                    "source_tables": [
                        {
                            "file_name": "InfoPack_XOL_2024.xlsx",
                            "sheet_name": "LIST BIG LOSS",
                        }
                    ]
                },
                "mapping_version": 2,
            },
        ]

        class AmbiguousDatabase:
            def execute(self, query, *_args, **_kwargs):
                if "master_mapping_column_infopack" in str(query):
                    return FakeResult(ambiguous_rows)
                return FakeResult([])

        self.assertEqual(
            _load_column_mapping(
                AmbiguousDatabase(),
                "LB003",
                "LIST BIG LOSS",
                True,
                "Renamed_InfoPack.xlsx",
            ),
            {},
        )

    def test_add_infopack_mapping_version_inserts_into_dedicated_table(self):
        catalog = [
            {
                "field_id": 81,
                "field_name": "gross",
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

            def scalar(self):
                return self.scalar_value

            def __iter__(self):
                return iter(self.rows)

        class FakeDatabase:
            def __init__(self):
                self.inserted_table = None

            def execute(self, query, parameters=None):
                query_text = str(query)
                if "SELECT cedant_code FROM rekonsiliasi.master_oscedant_code" in query_text:
                    return FakeResult([("LC011",)])
                if "SELECT field_id, field_name" in query_text:
                    return FakeResult(catalog)
                if "SELECT MAX(m.mapping_version)" in query_text:
                    return FakeResult(scalar_value=3)
                if "SELECT MAX(t.mapping_version)" in query_text:
                    return FakeResult(scalar_value=4)
                if "INSERT INTO rekonsiliasi.master_mapping_column_infopack" in query_text:
                    self.inserted_table = "infopack"
                return FakeResult()

            def commit(self):
                pass

            def rollback(self):
                pass

        database = FakeDatabase()
        result = add_mapping_version(
            {
                "cedant_code": "LC011",
                "dataset_type": "Infopack",
                "sheet_names": ["Claims"],
                "mapping": {"gross": "Gross Amount"},
            },
            database,
            "session-1",
        )

        self.assertEqual(result["mapping_version"], 5)
        self.assertEqual(database.inserted_table, "infopack")

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

    def test_infopack_upload_profile_uses_latest_version_only(self):
        infopack_rows = [
            {
                "cedant_code": "LB003",
                "cedant_name": "PT ASURANSI BHAKTI BHAYANGKARA",
                "excel_name": "INSURED",
                "field_name": "insured",
                "dataset_type": "INFOPACK",
                "mapping_version": 1,
                "argument": {},
            },
            {
                "cedant_code": "LB003",
                "cedant_name": "PT ASURANSI BHAKTI BHAYANGKARA",
                "excel_name": "PLA No.",
                "field_name": "loss_ref",
                "dataset_type": "INFOPACK",
                "mapping_version": 3,
                "argument": {},
            },
            {
                "cedant_code": "LB003",
                "cedant_name": "PT ASURANSI BHAKTI BHAYANGKARA",
                "excel_name": "Date of / Loss",
                "field_name": "dol",
                "dataset_type": "INFOPACK",
                "mapping_version": 3,
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
                if "SELECT m.cedant_code" in query_text:
                    return FakeResult(infopack_rows)
                if "SELECT DISTINCT ON (b.cedant_code" in query_text:
                    return FakeResult([])
                if "SELECT field_name, dataset_type" in query_text:
                    return FakeResult(
                        [
                            {
                                "field_name": field,
                                "dataset_type": "INFOPACK",
                                "default_source": "column",
                            }
                            for field in ("insured", "loss_ref", "dol")
                        ]
                    )
                if "SELECT DISTINCT ON (cedant_code)" in query_text:
                    return FakeResult(
                        [{"cedant_code": "LB003", "cedant_name": "PT ASURANSI BHAKTI BHAYANGKARA"}]
                    )
                return FakeResult([])

        result = get_column_mappings(FakeDatabase())
        profiles = [
            profile
            for profile in result["profiles"]
            if profile["tipe_data"] == "Infopack"
        ]

        self.assertEqual(len(profiles), 1)
        self.assertEqual(
            profiles[0]["mapping"],
            {"doc_no": "PLA No.", "dol": "Date of / Loss"},
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

    def test_infopack_profiles_use_source_table_sheet_names(self):
        rows = [
            {
                "cedant_code": "LB003",
                "cedant_name": "LB",
                "excel_name": "Claim No.",
                "field_name": "loss_ref",
                "dataset_type": "INFOPACK",
                "mapping_version": 2,
                "argument": {
                    "source_tables": [
                        {
                            "file_name": "InfoPack_XOL_2024.xlsx",
                            "sheet_name": "LIST BIG LOSS",
                        }
                    ]
                },
            }
        ]

        profiles = _build_mapping_version_profiles(rows)

        self.assertEqual(len(profiles), 1)
        self.assertEqual(profiles[0]["sheetNames"], ["LIST BIG LOSS"])

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
