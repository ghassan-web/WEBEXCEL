import unittest
from datetime import date
from decimal import Decimal
from io import BytesIO
from unittest.mock import patch

from fastapi import HTTPException
from openpyxl import Workbook
from openpyxl.styles import PatternFill

from app.services import excel_service
from app.routers.master import (
    _auto_mapping_for_catalog,
    _auto_match_headers_for_sheet,
    _build_workflow_infopack_row,
    _is_infopack_summary_sheet,
    _match_infopack_mapping_header,
    _find_identical_mapping_version,
    _extract_infopack_row,
    _is_infopack_summary_row,
    _infopack_rule_mapping,
    _normalize_requested_mapping,
    _suggest_existing_mapping,
    _target_schema_for_catalog,
    _validate_required_mapping_catalog,
    _validate_infopack_headers,
    _validate_infopack_mapping_rules,
    _validate_infopack_rows,
    _workflow_mapping_status,
    get_upload_table_mapping,
)
from app.models.models import MasterOsCedant, MasterOsInfopack, MasterRawRow, ScannedSchema
from app.services.excel_service import ingest_excel_raw


class InfopackUploadValidationTests(unittest.TestCase):
    def test_master_and_upload_archive_models_use_rekonsiliasi_schema(self):
        for model in (MasterOsCedant, MasterOsInfopack, MasterRawRow, ScannedSchema):
            with self.subTest(model=model.__name__):
                self.assertEqual(model.__table__.schema, "rekonsiliasi")

    def setUp(self):
        self.headers = [
            "Loss Ref", "Date of Loss", "COB", "Gross", "TSI",
            "Surplus Outstanding", "Insured Name",
        ]
        self.mapping = _auto_match_headers_for_sheet(self.headers, True, {})

    def test_extracts_required_fields_using_existing_db_names(self):
        row = _extract_infopack_row(
            {
                "data": {
                    "Loss Ref": "CLM-001",
                    "Date of Loss": "2025-03-14",
                    "COB": "Property",
                    "Gross": "1,234.56",
                    "TSI": "2,500.00",
                    "Surplus Outstanding": "750.00",
                    "Insured Name": "Example insured",
                }
            },
            "C001",
            "3",
            "2025",
            "infopack.xlsx",
            "Sheet1",
            0,
            self.mapping,
        )

        self.assertEqual(row["dol"], date(2025, 3, 14))
        self.assertEqual(row["cob"], "Property")
        self.assertEqual(row["gross"], Decimal("1234.56"))
        self.assertEqual(row["tsi"], Decimal("2500.00"))
        self.assertEqual(row["loss_ref"], "CLM-001")
        self.assertEqual(row["surplus_outstanding"], "750.00")

    def test_rejects_missing_required_header(self):
        headers = ["Loss Ref", "DOL", "COB", "Gross"]
        mapping = _auto_match_headers_for_sheet(headers, True, {})

        with self.assertRaises(HTTPException) as raised:
            _validate_infopack_headers(headers, mapping)

        self.assertEqual(raised.exception.status_code, 422)
        self.assertIn("Surplus Outstanding atau QS Outstanding", raised.exception.detail)

    def test_rejects_rows_with_invalid_required_values(self):
        row = _extract_infopack_row(
            {
                "data": {
                    "Loss Ref": "CLM-001",
                    "Date of Loss": "not-a-date",
                    "COB": "Property",
                    "Gross": "not-a-number",
                    "TSI": "2,500.00",
                    "Surplus Outstanding": "750.00",
                }
            },
            "C001",
            "3",
            "2025",
            "infopack.xlsx",
            "Sheet1",
            0,
            self.mapping,
        )

        with self.assertRaises(HTTPException) as raised:
            _validate_infopack_rows({0: row})

        self.assertEqual(raised.exception.status_code, 422)
        self.assertIn("DOL", raised.exception.detail)
        self.assertIn("Gross", raised.exception.detail)

    def test_workflow_validation_reports_actual_excel_row(self):
        row = {
            "loss_ref": "CLM-001",
            "dol": None,
            "cob": "Property",
            "gross": Decimal("12.50"),
            "surplus_outstanding": Decimal("25.00"),
        }

        with self.assertRaises(HTTPException) as raised:
            _validate_infopack_rows({8: row}, row_numbers_are_excel=True)

        self.assertIn("baris Excel: 8", raised.exception.detail)

    def test_workflow_accepts_either_outstanding_share_mapping(self):
        complete, missing = _workflow_mapping_status(
            {
                "loss_ref": "Claim Ref",
                "dol": "Date of Loss",
                "gross": "Gross",
                "cob": "COB",
                "qs_outstanding": "QS OS",
            },
            "INFOPACK",
        )

        self.assertTrue(complete)
        self.assertEqual(missing, [])

    def test_workflow_requires_at_least_one_outstanding_share_mapping(self):
        complete, missing = _workflow_mapping_status(
            {
                "loss_ref": "Claim Ref",
                "dol": "Date of Loss",
                "gross": "Gross",
                "cob": "COB",
            },
            "INFOPACK",
        )

        self.assertFalse(complete)
        self.assertIn("infopack_outstanding", missing)

    def test_class_code_is_optional_without_a_mapping_rule_and_required_with_one(self):
        mapping = {
            "loss_ref": "Claim Ref",
            "dol": "Date of Loss",
            "gross": "Gross",
            "qs_outstanding": "QS OS",
        }

        self.assertEqual(
            _workflow_mapping_status(mapping, "INFOPACK"),
            (True, []),
        )
        self.assertEqual(
            _workflow_mapping_status(
                mapping,
                "INFOPACK",
                required_mapping_fields={"class_code"},
            ),
            (False, ["class_code"]),
        )

    def test_infopack_row_validation_allows_missing_class_code(self):
        _validate_infopack_rows(
            {
                2: {
                    "loss_ref": "CLM-001",
                    "dol": date(2025, 3, 14),
                    "gross": Decimal("100.00"),
                    "surplus_outstanding": Decimal("25.00"),
                }
            },
        )

    def test_skips_total_rows_without_a_claim_reference(self):
        mapping = {
            "loss_ref": "Claim No",
            "dol": "DOL",
            "policy_expiry_date": "Exp_Date",
        }

        self.assertTrue(
            _is_infopack_summary_row(
                {
                    "Claim No": "",
                    "DOL": "TOTAL 2020",
                    "Exp_Date": "",
                },
                mapping,
            )
        )
        self.assertTrue(
            _is_infopack_summary_row(
                {
                    "Claim No": "",
                    "DOL": "",
                    "Exp_Date": "GRAND TOTAL",
                },
                mapping,
            )
        )
        self.assertFalse(
            _is_infopack_summary_row(
                {
                    "Claim No": "CLM-001",
                    "DOL": "TOTAL 2020",
                    "Exp_Date": "",
                },
                mapping,
            )
        )

    def test_workflow_accepts_qs_value_when_surplus_is_empty(self):
        _validate_infopack_rows(
            {
                2: {
                    "loss_ref": "CLM-001",
                    "dol": date(2025, 3, 14),
                    "cob": "Property",
                    "gross": Decimal("100.00"),
                    "surplus_outstanding": None,
                    "qs_outstanding": "25.00",
                }
            }
        )

    def test_workflow_rejects_non_numeric_outstanding_amounts(self):
        with self.assertRaises(HTTPException) as raised:
            _validate_infopack_rows(
                {
                    2: {
                        "loss_ref": "CLM-001",
                        "dol": date(2025, 3, 14),
                        "cob": "Property",
                        "gross": Decimal("100.00"),
                        "surplus_outstanding": "not a number",
                        "qs_outstanding": None,
                    }
                }
            )

        self.assertIn("Surplus Outstanding", raised.exception.detail)
        self.assertIn("nilai tidak valid", raised.exception.detail)

    def test_infopack_schema_uses_class_code_column_field(self):
        catalog = [
            {"field_id": 1, "field_name": "loss_ref", "data_type": "text", "default_source": "column"},
            {"field_id": 2, "field_name": "class_code", "data_type": "text", "default_source": "column"},
            {"field_id": 3, "field_name": "gross", "data_type": "numeric", "default_source": "column"},
        ]

        schema = _target_schema_for_catalog("INFOPACK", catalog)

        self.assertEqual(
            [field["dbField"] for field in schema],
            ["loss_ref", "class_code", "gross"],
        )

    def test_legacy_cob_mapping_is_normalized_to_class_code(self):
        catalog = [
            {"field_name": "class_code", "default_source": "column"},
        ]

        self.assertEqual(
            _normalize_requested_mapping(
                {"cob": "Class Code"},
                ["Class Code", "Class of Business"],
                catalog,
                "INFOPACK",
            ),
            {"class_code": "Class Code"},
        )
        with self.assertRaises(HTTPException) as raised:
            _normalize_requested_mapping(
                {
                    "class_code": "Class Code",
                    "cob": "Class of Business",
                },
                ["Class Code", "Class of Business"],
                catalog,
                "INFOPACK",
            )

        self.assertIn("hanya dapat dipetakan ke satu kolom", raised.exception.detail)

    def test_review_mapping_exposes_only_one_class_code_cob_field(self):
        context = {
            "dataset_type": "INFOPACK",
            "cedant_code": "LB003",
            "file_name": "Claims.xlsx",
            "sheet_name": "Claims",
            "reporting_month": "3",
            "reporting_year": "2025",
            "table_id": 1,
            "batch_id": 1,
            "sheet_index": 0,
            "table_status": "needs_review",
            "mapping_version": None,
            "applied_mapping": None,
        }
        catalog = [
            {"field_name": "class_code", "default_source": "column"},
            {"field_name": "cob", "default_source": "column"},
        ]

        for rule_fields, expected_required in (
            (set(), False),
            ({"class_code"}, True),
        ):
            with self.subTest(rule_fields=rule_fields):
                with (
                    patch(
                        "app.routers.master._upload_table_context",
                        return_value=context,
                    ),
                    patch(
                        "app.routers.master._table_headers",
                        return_value=["Class Code", "Class of Business"],
                    ),
                    patch(
                        "app.routers.master._read_workflow_raw_rows",
                        return_value=[
                            (
                                None,
                                {
                                    "Class Code": "FORM",
                                    "Class of Business": "Fire",
                                },
                                {"excel_row": 2},
                            )
                        ],
                    ),
                    patch(
                        "app.routers.master._load_field_catalog",
                        return_value=catalog,
                    ),
                    patch(
                        "app.routers.master._suggest_existing_mapping",
                        return_value=(1, {}, rule_fields),
                    ),
                ):
                    response = get_upload_table_mapping(1, None, "session")

                fields = response["field_catalog"]
                self.assertEqual(
                    [field["field_name"] for field in fields],
                    ["class_code"],
                )
                self.assertEqual(fields[0]["required"], expected_required)

    def test_missing_class_code_header_does_not_make_sheet_mapping_incomplete(self):
        class FakeResult:
            def mappings(self):
                return self

            def __iter__(self):
                return iter(
                    [
                        {
                            "mapping_version": 1,
                            "field_name": "class_code",
                            "header_name": "Class Code",
                            "argument": {
                                "source_tables": [
                                    {
                                        "file_name": "Claims.xlsx",
                                        "sheet_name": "Claims",
                                    }
                                ]
                            },
                        }
                    ]
                )

        class FakeDatabase:
            def execute(self, query, parameters=None):
                return FakeResult()

        _, mapping, mapping_rule_fields = _suggest_existing_mapping(
            FakeDatabase(),
            "LB003",
            "INFOPACK",
            "Claims",
            ["Claim No", "Date of Loss", "Gross", "QS OS"],
            [
                {"field_name": "class_code", "default_source": "column"},
            ],
            "Claims.xlsx",
        )

        self.assertEqual(mapping, {})
        self.assertNotIn("class_code", mapping_rule_fields)
        self.assertEqual(
            _workflow_mapping_status(
                {
                    "loss_ref": "Claim No",
                    "dol": "Date of Loss",
                    "gross": "Gross",
                    "qs_outstanding": "QS OS",
                },
                "INFOPACK",
                required_mapping_fields=mapping_rule_fields,
            ),
            (True, []),
        )

    def test_class_code_rule_from_another_sheet_does_not_make_mapping_required(self):
        class FakeResult:
            def mappings(self):
                return self

            def __iter__(self):
                return iter(
                    [
                        {
                            "mapping_version": 1,
                            "field_name": "class_code",
                            "header_name": "Class Code",
                            "argument": {
                                "source_tables": [
                                    {
                                        "file_name": "Claims.xlsx",
                                        "sheet_name": "Other Sheet",
                                    }
                                ]
                            },
                        }
                    ]
                )

        class FakeDatabase:
            def execute(self, query, parameters=None):
                return FakeResult()

        _, _, mapping_rule_fields = _suggest_existing_mapping(
            FakeDatabase(),
            "LB003",
            "INFOPACK",
            "Claims",
            ["Claim No", "Class Code", "Date of Loss", "Gross", "QS OS"],
            [{"field_name": "class_code", "default_source": "column"}],
            "Claims.xlsx",
        )

        self.assertNotIn("class_code", mapping_rule_fields)

    def test_infopack_mapping_rules_normalize_legacy_aliases_for_multiple_headers(self):
        column_fields = (
            "loss_ref", "insured", "gross", "dol", "currency", "policy_number",
            "policy_comm_date", "policy_expiry_date", "surplus_outstanding",
            "qs_outstanding",
        )
        catalog = [
            {"field_name": field, "default_source": "column"}
            for field in column_fields
        ] + [{"field_name": "class_code", "default_source": "column"}]
        profile_cases = [
            (
                [
                    "CLAIM NO.", "CLASS CODE", "INSURED NAME", "LOSS DATE", "COB",
                    "GROSS CLAIM", "SURPLUS", "QUOTA SHARE",
                ],
                {
                    "doc_no": "CLAIM NO.",
                    "class_code": "CLASS CODE",
                    "title": "INSURED NAME",
                    "dol": "LOSS DATE",
                    "gross": "GROSS CLAIM",
                    "surplus_outstanding": "SURPLUS",
                    "qs_outstanding": "QUOTA SHARE",
                },
            ),
            (
                [
                    "Claim Reference No", "Tertanggung", "Date of Loss",
                    "Class of Business", "Bruto Claim", "SUR PLUS", "QS",
                ],
                {
                    "doc_no": "Claim Reference No",
                    "title": "Tertanggung",
                    "dol": "Date of Loss",
                    "gross": "Bruto Claim",
                    "surplus_outstanding": "SUR PLUS",
                    "qs_outstanding": "QS",
                },
            ),
        ]

        for headers, existing_mapping in profile_cases:
            with self.subTest(headers=headers):
                mapping = _auto_mapping_for_catalog(
                    headers,
                    "INFOPACK",
                    catalog,
                    existing_mapping,
                )
                self.assertEqual(mapping["loss_ref"], existing_mapping["doc_no"])
                if existing_mapping.get("class_code"):
                    self.assertEqual(
                        mapping["class_code"],
                        existing_mapping["class_code"],
                    )
                self.assertEqual(mapping["insured"], existing_mapping["title"])
                self.assertEqual(mapping["dol"], existing_mapping["dol"])
                self.assertEqual(mapping["gross"], existing_mapping["gross"])
                self.assertEqual(
                    mapping["surplus_outstanding"],
                    existing_mapping["surplus_outstanding"],
                )
                self.assertEqual(
                    mapping["qs_outstanding"],
                    existing_mapping["qs_outstanding"],
                )

        fallback_headers = [
            "Claim Reference No", "Class Code", "Insured Name", "Date of Loss",
            "Class of Business", "Gross Claim Amount",
            "Surplus Outstanding", "Quota Share",
        ]
        fallback_mapping = _auto_mapping_for_catalog(
            fallback_headers,
            "INFOPACK",
            catalog,
        )
        self.assertEqual(fallback_mapping["loss_ref"], "Claim Reference No")
        self.assertEqual(fallback_mapping["class_code"], "Class Code")
        self.assertEqual(fallback_mapping["dol"], "Date of Loss")
        self.assertEqual(fallback_mapping["gross"], "Gross Claim Amount")
        self.assertNotIn("cob", fallback_mapping)
        self.assertEqual(fallback_mapping["surplus_outstanding"], "Surplus Outstanding")
        self.assertEqual(fallback_mapping["qs_outstanding"], "Quota Share")

        stale_rule_fallback = _auto_mapping_for_catalog(
            fallback_headers,
            "INFOPACK",
            catalog,
            {
                "doc_no": "Old Claim Header",
                "title": "Old Insured Header",
                "dol": "Old Loss Date",
                "gross": "Old Gross Header",
                "surplus_outstanding": "Old Surplus Header",
                "qs_outstanding": "Old QS Header",
            },
            allow_fallback_when_rule_misses=True,
        )
        self.assertEqual(stale_rule_fallback["loss_ref"], "Claim Reference No")
        self.assertEqual(stale_rule_fallback["dol"], "Date of Loss")
        self.assertEqual(stale_rule_fallback["gross"], "Gross Claim Amount")
        self.assertNotIn("cob", stale_rule_fallback)
        self.assertEqual(
            stale_rule_fallback["surplus_outstanding"],
            "Surplus Outstanding",
        )
        self.assertEqual(stale_rule_fallback["qs_outstanding"], "Quota Share")
        complete, missing = _workflow_mapping_status(
            stale_rule_fallback,
            "INFOPACK",
        )
        self.assertTrue(complete)
        self.assertEqual(missing, [])

    def test_workflow_class_code_comes_from_mapped_column(self):
        context = {
            "cedant_code": "C001",
            "reporting_month": "3",
            "reporting_year": "2025",
            "file_name": "infopack.xlsx",
            "sheet_name": "Sheet1",
        }
        data = {
            "Claim Reference": "CLM-123",
            "Class Code": "FORM-CODE",
            "COB": "Property",
            "Date of Loss": "2025-03-14",
            "Gross": "100",
            "Surplus Outstanding": "60",
            "Quota Share Outstanding": "40",
        }
        mapping = {
            "loss_ref": "Claim Reference",
            "class_code": "Class Code",
            "dol": "Date of Loss",
            "gross": "Gross",
            "surplus_outstanding": "Surplus Outstanding",
            "qs_outstanding": "Quota Share Outstanding",
        }
        with patch(
            "app.routers.master._normalize_cob",
            return_value=("FORM-CODE", "Form class"),
        ):
            row = _build_workflow_infopack_row(
                None,
                data,
                mapping,
                context,
                2,
            )

        self.assertEqual(row["class_code"], "FORM-CODE")
        self.assertEqual(row["cob"], "Form class")
        self.assertEqual(row["loss_ref"], "CLM-123")
        self.assertEqual(row["surplus_outstanding"], Decimal("60"))
        self.assertEqual(row["qs_outstanding"], Decimal("40"))

    def test_sheet_level_cob_completes_mapping_and_builds_rows(self):
        context = {
            "cedant_code": "C001",
            "reporting_month": "3",
            "reporting_year": "2025",
            "file_name": "infopack.xlsx",
            "sheet_name": "List of big loss",
            "__cob": "ALL BUSINESS",
        }
        mapping = {
            "loss_ref": "PLA",
            "dol": "D.O.L",
            "gross": "GROSS CLAIM",
            "surplus_outstanding": "SURPLUS",
        }
        self.assertTrue(_is_infopack_summary_sheet({"cob": "COB", "qs_outstanding": "QS"}))
        self.assertFalse(_is_infopack_summary_sheet(mapping))
        self.assertEqual(_match_infopack_mapping_header("PLA No.", ["PLA"]), "PLA")
        self.assertEqual(
            _workflow_mapping_status(mapping, "INFOPACK", context),
            (True, []),
        )

        with patch(
            "app.routers.master._normalize_cob",
            return_value=("ALL-BUSINESS", "ALL BUSINESS"),
        ):
            row = _build_workflow_infopack_row(
                None,
                {
                    "PLA": "PL-123",
                    "D.O.L": "2025-03-14",
                    "GROSS CLAIM": "1000",
                    "SURPLUS": "600",
                },
                mapping,
                context,
                16,
            )

        self.assertEqual(row["class_code"], "ALL-BUSINESS")
        self.assertEqual(row["cob"], "ALL BUSINESS")

    def test_infopack_mapping_rule_aliases_legacy_loss_ref_and_pla_header(self):
        class FakeResult:
            def mappings(self):
                return self

            def __iter__(self):
                return iter(
                    [
                        {
                            "mapping_version": 1,
                            "is_active": False,
                            "field_name": "doc_no",
                            "header_name": "PLA No.",
                            "argument": {},
                        }
                    ]
                )

        class FakeDatabase:
            def execute(self, query, parameters=None):
                self.query = str(query)
                return FakeResult()

        database = FakeDatabase()
        version, mapping, configured_fields = _suggest_existing_mapping(
            database,
            "LB003",
            "INFOPACK",
            "List of big loss",
            ["PLA"],
            [
                {"field_name": "loss_ref", "default_source": "column"},
                {"field_name": "dol", "default_source": "column"},
                {"field_name": "gross", "default_source": "column"},
            ],
        )

        self.assertEqual(version, 1)
        self.assertEqual(mapping, {"loss_ref": "PLA"})
        self.assertEqual(configured_fields, {"loss_ref"})
        self.assertNotIn("m.is_active = TRUE", database.query)

    def test_infopack_auto_mapping_matches_saved_header_punctuation(self):
        catalog = [
            {"field_name": "loss_ref", "default_source": "column"},
        ]

        mapping = _auto_mapping_for_catalog(
            ["CLAIM NO"],
            "INFOPACK",
            catalog,
            {"loss_ref": "Claim No."},
            allow_fallback_when_rule_misses=True,
        )

        self.assertEqual(mapping, {"loss_ref": "CLAIM NO"})

    def test_infopack_active_rules_block_guesses_for_unconfigured_columns(self):
        catalog = [
            {"field_name": field, "default_source": "column"}
            for field in (
                "loss_ref",
                "dol",
                "gross",
                "cob",
                "surplus_outstanding",
                "qs_outstanding",
                "insured",
            )
        ]
        headers = [
            "Claim Reference No",
            "Insured Name",
            "Date of Loss",
            "Class of Business",
            "Gross Claim Amount",
            "Surplus Outstanding",
        ]

        mapping = _infopack_rule_mapping(
            headers,
            catalog,
            {
                "loss_ref": "Claim Reference No",
                "dol": "Date of Loss",
                "gross": "Old Gross Header",
            },
        )

        self.assertEqual(
            mapping,
            {
                "loss_ref": "Claim Reference No",
                "dol": "Date of Loss",
            },
        )

    def test_infopack_upload_mapping_must_match_active_rules(self):
        _validate_infopack_mapping_rules(
            {"loss_ref": "CLAIM NO"},
            {"loss_ref": "Claim No"},
            {"loss_ref"},
        )

        _validate_infopack_mapping_rules({}, {}, set())

        with self.assertRaises(HTTPException) as raised:
            _validate_infopack_mapping_rules(
                {"loss_ref": "Other Claim"},
                {"loss_ref": "Claim No"},
                {"loss_ref"},
            )

        self.assertEqual(raised.exception.status_code, 422)
        _validate_infopack_mapping_rules(
            {
                "loss_ref": "Claim No",
                "class_code": "Class Code",
            },
            {"loss_ref": "Claim No"},
            {"loss_ref"},
        )

    def test_infopack_upload_uses_latest_mapping_version_as_a_snapshot(self):
        class FakeResult:
            def mappings(self):
                return self

            def __iter__(self):
                return iter(
                    [
                        {
                            "mapping_version": 1,
                            "field_name": "loss_ref",
                            "header_name": "Claim No.",
                            "argument": {},
                        },
                        {
                            "mapping_version": 1,
                            "field_name": "dol",
                            "header_name": "D.O.L",
                            "argument": {},
                        },
                        {
                            "mapping_version": 1,
                            "field_name": "gross",
                            "header_name": "Gross Claim",
                            "argument": {},
                        },
                        {
                            "mapping_version": 1,
                            "field_name": "insured",
                            "header_name": "Insured",
                            "argument": {},
                        },
                        {
                            "mapping_version": 3,
                            "field_name": "loss_ref",
                            "header_name": "PLA No.",
                            "argument": {},
                        },
                        {
                            "mapping_version": 3,
                            "field_name": "dol",
                            "header_name": "Date of / Loss",
                            "argument": {},
                        },
                        {
                            "mapping_version": 3,
                            "field_name": "gross",
                            "header_name": "Gross / Incurred",
                            "argument": {},
                        },
                    ]
                )

        class FakeDatabase:
            def execute(self, query, parameters=None):
                return FakeResult()

        catalog = [
            {"field_name": field, "default_source": "column"}
            for field in ("loss_ref", "dol", "gross", "insured")
        ]
        headers = ["PLA No.", "Date of / Loss", "Gross / Incurred", "Insured"]

        version, mapping, configured_fields = _suggest_existing_mapping(
            FakeDatabase(),
            "LB003",
            "INFOPACK",
            "Claims",
            headers,
            catalog,
        )

        self.assertEqual(version, 3)
        self.assertEqual(
            mapping,
            {
                "loss_ref": "PLA No.",
                "dol": "Date of / Loss",
                "gross": "Gross / Incurred",
            },
        )
        self.assertEqual(configured_fields, {"loss_ref", "dol", "gross"})

    def test_infopack_mapping_does_not_guess_between_same_sheet_sources(self):
        rows = [
            {
                "mapping_version": 1,
                "field_name": "loss_ref",
                "header_name": "Old Claim",
                "argument": {
                    "source_tables": [
                        {
                            "file_name": "InfoPack_Proportional.xlsx",
                            "sheet_name": "LIST BIG LOSS",
                        }
                    ]
                },
            },
            {
                "mapping_version": 2,
                "field_name": "loss_ref",
                "header_name": "XOL Claim",
                "argument": {
                    "source_tables": [
                        {
                            "file_name": "InfoPack_XOL_2024.xlsx",
                            "sheet_name": "LIST BIG LOSS",
                        }
                    ]
                },
            },
        ]

        class FakeResult:
            def mappings(self):
                return self

            def __iter__(self):
                return iter(rows)

        class FakeDatabase:
            def execute(self, query, parameters=None):
                return FakeResult()

        version, mapping, configured_fields = _suggest_existing_mapping(
            FakeDatabase(),
            "LB003",
            "INFOPACK",
            "LIST BIG LOSS",
            ["Old Claim", "XOL Claim"],
            [{"field_name": "loss_ref", "default_source": "column"}],
            "Renamed_InfoPack.xlsx",
        )

        self.assertIsNone(version)
        self.assertEqual(mapping, {})
        self.assertEqual(configured_fields, {"loss_ref"})

    def test_infopack_mapping_matches_download_copy_suffix_for_source_file(self):
        rows = [
            {
                "mapping_version": 1,
                "field_name": "loss_ref",
                "header_name": "Claim No",
                "argument": {
                    "source_tables": [
                        {
                            "file_name": "OONA Info Pack.xlsx",
                            "sheet_name": "6.1 Loss Info - Fire",
                        }
                    ]
                },
            },
            {
                "mapping_version": 2,
                "field_name": "loss_ref",
                "header_name": "XOL Claim",
                "argument": {
                    "source_tables": [
                        {
                            "file_name": "OONA XOL Info Pack.xlsx",
                            "sheet_name": "6.1 Loss Info - Fire",
                        }
                    ]
                },
            },
        ]

        class FakeResult:
            def mappings(self):
                return self

            def __iter__(self):
                return iter(rows)

        class FakeDatabase:
            def execute(self, query, parameters=None):
                return FakeResult()

        version, mapping, configured_fields = _suggest_existing_mapping(
            FakeDatabase(),
            "LB003",
            "INFOPACK",
            "6.1 Loss Info - Fire",
            ["Claim No", "XOL Claim"],
            [{"field_name": "loss_ref", "default_source": "column"}],
            "OONA Info Pack (1).xlsx",
        )

        self.assertEqual(version, 1)
        self.assertEqual(mapping, {"loss_ref": "Claim No"})
        self.assertEqual(configured_fields, {"loss_ref"})

    def test_os_required_fields_must_exist_as_column_catalog_fields(self):
        catalog = [
            {"field_name": field, "default_source": "column"}
            for field in ("loss_ref", "outstanding", "dol", "currency")
        ]

        _validate_required_mapping_catalog("OS CEDANT", catalog)

        with self.assertRaises(HTTPException) as raised:
            _validate_required_mapping_catalog(
                "OS CEDANT",
                [field for field in catalog if field["field_name"] != "outstanding"],
            )
        self.assertEqual(raised.exception.status_code, 500)
        self.assertIn("outstanding", raised.exception.detail)

    def test_mapping_version_reuse_compares_complete_cedant_column_rules(self):
        catalog = [
            {"field_name": field, "default_source": "column"}
            for field in ("loss_ref", "outstanding", "dol", "currency")
        ] + [{"field_name": "file_name", "default_source": "file_metadata"}]
        current = {
            "loss_ref": "Claim No",
            "outstanding": "Net OS",
            "dol": "Date of Loss",
            "currency": "Currency",
            "file_name": "Source File",
        }

        self.assertEqual(
            _find_identical_mapping_version(
                current,
                [
                    (
                        3,
                        {
                            "dol": " date  of loss ",
                            "loss_ref": "Claim No",
                            "outstanding": "Net OS",
                            "currency": "Currency",
                            "file_name": "Different file metadata",
                        },
                    )
                ],
                catalog,
            ),
            3,
        )
        self.assertIsNone(
            _find_identical_mapping_version(
                current,
                [
                    (
                        3,
                        {
                            "loss_ref": "Claim No",
                            "outstanding": "Net OS",
                            "dol": "Date of Loss",
                        },
                    )
                ],
                catalog,
            )
        )

    def test_raw_ingestion_opens_workbook_once_and_preserves_excel_row_numbers(self):
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.title = "Claims"
        worksheet.append(["DOL", "Gross"])
        worksheet.append(["2025-01-02", "100"])
        worksheet.append([None, None])
        worksheet.append(["2025-01-02", "100"])
        data = BytesIO()
        workbook.save(data)

        original_loader = excel_service.openpyxl.load_workbook
        with patch.object(
            excel_service.openpyxl,
            "load_workbook",
            wraps=original_loader,
        ) as workbook_loader:
            result = ingest_excel_raw(data.getvalue(), "Claims")

        self.assertEqual(workbook_loader.call_count, 1)
        self.assertEqual(result["total_rows"], 2)
        self.assertEqual(
            [row["excel_row"] for row in result["rows"]],
            [2, 4],
        )
        self.assertEqual(
            result["rows"][0]["data"],
            result["rows"][1]["data"],
        )

    def test_raw_ingestion_ignores_trailing_formatted_empty_columns(self):
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.title = "Claims"
        worksheet.append(["Claim No", "Outstanding"])
        worksheet.append(["C-1", 125])
        worksheet.cell(row=1, column=500).fill = PatternFill(
            fill_type="solid",
            fgColor="FFFFFF",
        )
        data = BytesIO()
        workbook.save(data)
        inflated_workbook = excel_service.openpyxl.load_workbook(
            BytesIO(data.getvalue()),
            read_only=True,
            data_only=True,
        )
        self.assertEqual(inflated_workbook["Claims"].max_column, 500)
        inflated_workbook.close()

        result = ingest_excel_raw(data.getvalue(), "Claims")

        self.assertEqual(result["columns"], ["Claim No", "Outstanding"])
        self.assertEqual(result["total_rows"], 1)
        self.assertEqual(result["rows"][0]["data"], {"Claim No": "C-1", "Outstanding": "125"})

        inspection = excel_service.inspect_excel_workbook(data.getvalue())

        self.assertEqual(inspection["sheet_columns"]["Claims"], ["Claim No", "Outstanding"])
        self.assertEqual(inspection["sheet_row_counts"]["Claims"], 1)
        comparison = excel_service.compare_excel(
            data.getvalue(),
            data.getvalue(),
            "Claim No",
            "Claims",
            "Claims",
        )
        self.assertEqual(comparison["summary"]["matched"], 1)

    def test_raw_ingestion_reuses_workbook_for_multiple_sheets(self):
        workbook = Workbook()
        first = workbook.active
        first.title = "Claims A"
        first.append(["Claim No", "Amount"])
        first.append(["A-1", 100])
        second = workbook.create_sheet("Claims B")
        second.append(["Claim No", "Amount"])
        second.append(["B-1", 200])
        data = BytesIO()
        workbook.save(data)

        original_loader = excel_service.openpyxl.load_workbook
        with patch.object(
            excel_service.openpyxl,
            "load_workbook",
            wraps=original_loader,
        ) as workbook_loader:
            results = list(
                excel_service.iter_ingest_excel_raw_sheets(
                    data.getvalue(),
                    ["Claims A", "Claims B"],
                )
            )

        self.assertEqual(workbook_loader.call_count, 1)
        self.assertEqual([result["sheet"] for _, result in results], ["Claims A", "Claims B"])
        self.assertEqual([result["total_rows"] for _, result in results], [1, 1])

    def test_raw_ingestion_extracts_sheet_level_class_of_business(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "List of big loss"
        sheet["B2"] = "CLASS OF BUSNIESS :"
        sheet["C2"] = "ALL BUSINESS"
        for column, header in enumerate(
            ["NO", "PLA", "D.O.L", "GROSS CLAIM", "SURPLUS"],
            start=1,
        ):
            sheet.cell(row=5, column=column, value=header)
        for column, value in enumerate(
            [1, "PL-123", "2025-03-14", 1000, 600],
            start=1,
        ):
            sheet.cell(row=6, column=column, value=value)
        data = BytesIO()
        workbook.save(data)

        parsed = ingest_excel_raw(data.getvalue(), sheet.title)

        self.assertEqual(parsed["sheet_metadata"], {"cob": "ALL BUSINESS"})
        self.assertEqual(parsed["columns"], ["NO", "PLA", "D.O.L", "GROSS CLAIM", "SURPLUS"])

    def test_raw_ingestion_preserves_values_beyond_preview_rows(self):
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.title = "Claims"
        worksheet.append(["Claim No", "Amount"])
        worksheet.append(["C-1", 125])
        worksheet.cell(row=41, column=500, value="late value")
        data = BytesIO()
        workbook.save(data)

        result = ingest_excel_raw(data.getvalue(), "Claims")

        self.assertEqual(len(result["columns"]), 500)
        self.assertEqual(result["total_rows"], 2)
        self.assertEqual(result["rows"][-1]["excel_row"], 41)
        self.assertEqual(result["rows"][-1]["data"]["Unnamed: 499"], "late value")

    def test_empty_sheet_returns_no_columns_instead_of_indexing_missing_header(self):
        workbook = unittest.mock.Mock()
        workbook.sheet_names = ["Empty"]

        with patch.object(
            excel_service.pd,
            "read_excel",
            return_value=excel_service.pd.DataFrame(),
        ):
            result, sheet_name, header_row = excel_service._read_excel_with_header_row(
                b"", "Empty", workbook
            )

        self.assertTrue(result.empty)
        self.assertEqual(list(result.columns), [])
        self.assertEqual(sheet_name, "Empty")
        self.assertEqual(header_row, 0)


if __name__ == "__main__":
    unittest.main()
