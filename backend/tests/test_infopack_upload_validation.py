import unittest
from datetime import date
from decimal import Decimal
from io import BytesIO
from unittest.mock import patch

from fastapi import HTTPException
from openpyxl import Workbook

from app.services import excel_service
from app.routers.master import (
    _auto_match_headers_for_sheet,
    _find_identical_mapping_version,
    _extract_infopack_row,
    _validate_required_mapping_catalog,
    _validate_infopack_headers,
    _validate_infopack_rows,
)
from app.models.models import MasterOsCedant, MasterOsInfopack, MasterRawRow, ScannedSchema
from app.services.excel_service import ingest_excel_raw


class InfopackUploadValidationTests(unittest.TestCase):
    def test_master_and_upload_archive_models_use_rekonsiliasi_schema(self):
        for model in (MasterOsCedant, MasterOsInfopack, MasterRawRow, ScannedSchema):
            with self.subTest(model=model.__name__):
                self.assertEqual(model.__table__.schema, "rekonsiliasi")

    def setUp(self):
        self.headers = ["Date of Loss", "COB", "Gross", "TSI", "Insured Name"]
        self.mapping = _auto_match_headers_for_sheet(self.headers, True, {})

    def test_extracts_required_fields_using_existing_db_names(self):
        row = _extract_infopack_row(
            {
                "data": {
                    "Date of Loss": "2025-03-14",
                    "COB": "Property",
                    "Gross": "1,234.56",
                    "TSI": "2,500.00",
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

    def test_rejects_missing_required_header(self):
        mapping = _auto_match_headers_for_sheet(["DOL", "COB", "Gross"], True, {})

        with self.assertRaises(HTTPException) as raised:
            _validate_infopack_headers(["DOL", "COB", "Gross"], mapping)

        self.assertEqual(raised.exception.status_code, 422)
        self.assertIn("TSI", raised.exception.detail)

    def test_rejects_rows_with_invalid_required_values(self):
        row = _extract_infopack_row(
            {
                "data": {
                    "Date of Loss": "not-a-date",
                    "COB": "Property",
                    "Gross": "not-a-number",
                    "TSI": "2,500.00",
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
            "dol": None,
            "cob": "Property",
            "gross": Decimal("12.50"),
            "tsi": Decimal("25.00"),
        }

        with self.assertRaises(HTTPException) as raised:
            _validate_infopack_rows({8: row}, row_numbers_are_excel=True)

        self.assertIn("baris Excel: 8", raised.exception.detail)

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
