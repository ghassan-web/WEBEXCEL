import unittest

from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from app.routers.master import _ensure_insured_result_column


class InsuredResultColumnTests(unittest.TestCase):
    class FakeDatabase:
        def __init__(self):
            self.statements = []

        def get_bind(self):
            class Bind:
                dialect = postgresql.dialect()

            return Bind()

        def execute(self, statement):
            self.statements.append(str(statement))

    def test_adds_insured_column_to_existing_result_tables_for_any_cedant(self):
        for table_name, header in (
            ("os_claim_cedant_askrindo", "Insured"),
            ("os_claim_cedant_aca", "Insured Name"),
        ):
            with self.subTest(table_name=table_name):
                db = self.FakeDatabase()
                columns = set()

                _ensure_insured_result_column(
                    db, table_name, columns, "insured", header
                )

                self.assertIn(header, columns)
                self.assertEqual(len(db.statements), 1)
                self.assertIn("ALTER TABLE", db.statements[0])
                self.assertIn(table_name, db.statements[0])
                self.assertIn(header, db.statements[0])
                self.assertIn("TEXT", db.statements[0])

    def test_does_not_add_other_missing_mapped_columns(self):
        db = self.FakeDatabase()

        with self.assertRaises(HTTPException) as raised:
            _ensure_insured_result_column(
                db, "os_claim_cedant_askrindo", set(), "outstanding", "Outstanding"
            )

        self.assertEqual(raised.exception.status_code, 422)
        self.assertEqual(db.statements, [])

    def test_does_not_add_insured_to_non_cedant_result_table(self):
        db = self.FakeDatabase()

        with self.assertRaises(HTTPException) as raised:
            _ensure_insured_result_column(
                db, "master_os_cedant_web", set(), "insured", "Insured"
            )

        self.assertEqual(raised.exception.status_code, 422)
        self.assertEqual(db.statements, [])


if __name__ == "__main__":
    unittest.main()
