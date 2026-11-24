import unittest

from app.routers.master import get_header_library


class HeaderLibraryEndpointTests(unittest.TestCase):
    class CountResult:
        def scalar_one(self):
            return 1

    class RowsResult:
        def mappings(self):
            return self

        def all(self):
            return [
                {
                    "header_id": 12,
                    "cedant_code": "ACA",
                    "cedant_name": "ACA",
                    "file_name": "claims.xlsx",
                    "batch_id": 7,
                    "table_id": 9,
                    "sheet_name": "Claims",
                    "column_index": 1,
                    "original_header": "Loss Date",
                    "mapping_version": None,
                    "uploaded_at": None,
                }
            ]

    class FakeDatabase:
        def __init__(self):
            self.executed = []

        def execute(self, statement, parameters):
            self.executed.append((str(statement), parameters))
            if "COUNT(*)" in str(statement):
                return HeaderLibraryEndpointTests.CountResult()
            return HeaderLibraryEndpointTests.RowsResult()

    def test_returns_header_rows_with_upload_metadata_and_filters(self):
        db = self.FakeDatabase()
        result = get_header_library(
            tipe_data="OS Cedant",
            cedant=" ACA ",
            search=" Loss ",
            skip=10,
            limit=25,
            db=db,
            session_id="e20ae4f3-9da3-43f0-852d-abba4e6dba31",
        )

        self.assertEqual(result["total"], 1)
        self.assertEqual(result["headers"][0]["original_header"], "Loss Date")
        self.assertEqual(result["headers"][0]["mapping_version"], None)
        self.assertEqual(len(db.executed), 2)

        count_sql, count_params = db.executed[0]
        self.assertIn("rekonsiliasi.header_library", count_sql)
        self.assertIn("ub.uploaded_by = :session_id", count_sql)
        self.assertEqual(count_params["dataset_type"], "OS CEDANT")
        self.assertEqual(count_params["cedant"], "ACA")
        self.assertEqual(count_params["search"], "%Loss%")

        rows_sql, rows_params = db.executed[1]
        self.assertIn("JOIN rekonsiliasi.upload_table", rows_sql)
        self.assertIn("JOIN rekonsiliasi.upload_batch", rows_sql)
        self.assertEqual(rows_params["limit"], 25)
        self.assertEqual(rows_params["skip"], 10)


if __name__ == "__main__":
    unittest.main()
