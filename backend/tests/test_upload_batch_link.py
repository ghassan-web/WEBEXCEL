import unittest

from app.routers.master import _write_cedant_rows, _write_infopack_rows


class UploadBatchLinkTests(unittest.TestCase):
    class FakeResult:
        def scalars(self):
            return self

        def all(self):
            return []

    class FakeQuery:
        def filter(self, *_args, **_kwargs):
            return self

        def order_by(self, *_args, **_kwargs):
            return self

        def all(self):
            return []

    class FakeDatabase:
        def __init__(self):
            self.executed = []

        def query(self, *_args, **_kwargs):
            return UploadBatchLinkTests.FakeQuery()

        def execute(self, statement, parameters=None):
            self.executed.append((str(statement), parameters))
            return UploadBatchLinkTests.FakeResult()

    def test_os_cedant_insert_references_upload_batch(self):
        db = self.FakeDatabase()
        stats = _write_cedant_rows(
            db,
            [
                {
                    "cedant_code": "LC011",
                    "doc_no": "CLM-001",
                    "dol": None,
                    "outstanding": 100,
                    "currency": "IDR",
                    "month": 1,
                    "year": 2025,
                    "file_name": "claims.xlsx",
                    "sheet_name": "Claims",
                }
            ],
            upload_batch_id=71,
        )

        insert_sql, parameters = next(
            (sql, params) for sql, params in db.executed if "INSERT INTO" in sql
        )
        self.assertIn("upload_batch_id", insert_sql)
        self.assertEqual(parameters[0]["upload_batch_id"], 71)
        self.assertEqual(stats["inserted"], 1)

    def test_infopack_insert_references_upload_batch(self):
        db = self.FakeDatabase()
        stats = _write_infopack_rows(
            db,
            [
                {
                    "cedant_code": "LC011",
                    "class_code": "01",
                    "title": "Insured",
                    "value": "100",
                    "row_index": 2,
                    "month": 1,
                    "year": 2025,
                    "file_name": "infopack.xlsx",
                    "sheet_name": "Info",
                    "dol": None,
                    "cob": "Property",
                    "gross": 100,
                    "tsi": 1000,
                }
            ],
            upload_batch_id=72,
        )

        insert_sql, parameters = next(
            (sql, params) for sql, params in db.executed if "INSERT INTO" in sql
        )
        self.assertIn("upload_batch_id", insert_sql)
        self.assertEqual(parameters[0]["upload_batch_id"], 72)
        self.assertEqual(stats["inserted"], 1)


if __name__ == "__main__":
    unittest.main()
