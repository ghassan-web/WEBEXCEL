import unittest

from app.services.cedant_result_schema import (
    resolve_result_columns,
    result_column_name,
    result_table_name,
)


class FirstMappingResultColumnTests(unittest.TestCase):
    def test_later_source_headers_use_the_first_mapping_header(self):
        first_headers = {"dol": "DOL", "loss_ref": "Claim Code"}
        self.assertEqual(
            result_column_name("dol", "Trans Desc/DOL", first_headers),
            "DOL",
        )
        self.assertEqual(
            result_column_name("loss_ref", "Policy Claim No", first_headers),
            "Claim Code",
        )

    def test_uses_source_header_when_no_first_mapping_exists(self):
        self.assertEqual(result_column_name("dol", "Date of Loss"), "Date of Loss")


class InfopackResultSchemaTests(unittest.TestCase):
    def test_reuses_first_result_column_when_infopack_source_header_changes(self):
        self.assertEqual(
            result_table_name("AON B INA", "INFOPACK"),
            "os_claim_infopack_aon_b_ina",
        )

        class FakeResult:
            def __init__(self, value=None, rows=()):
                self.value = value
                self.rows = rows

            def scalar_one(self):
                return self.value

            def mappings(self):
                return self

            def __iter__(self):
                return iter(self.rows)

        class FakeDatabase:
            def __init__(self):
                self.queries = []

            def execute(self, query, parameters=None):
                query_text = str(query)
                self.queries.append(query_text)
                if "SELECT EXISTS" in query_text:
                    return FakeResult(value=True)
                if "information_schema.columns" in query_text:
                    return FakeResult(
                        rows=[
                            {
                                "column_name": "First Claim Ref",
                                "udt_name": "text",
                                "is_nullable": "YES",
                                "is_identity": "NO",
                                "column_default": None,
                            }
                        ]
                    )
                return FakeResult(
                    rows=[
                        {
                            "field_name": "loss_ref",
                            "header_name": "First Claim Ref",
                        }
                    ]
                )

        database = FakeDatabase()
        resolved = resolve_result_columns(
            database,
            table_name="os_claim_infopack_aca",
            cedant_code="C001",
            mapping={
                "loss_ref": "Current Claim Ref",
                "class_code": "Class Code",
                "cob": "COB",
            },
            catalog=[
                {
                    "field_name": "loss_ref",
                    "default_source": "column",
                }
            ],
            dataset_type="INFOPACK",
        )

        self.assertEqual(
            resolved,
            {"loss_ref": "First Claim Ref"},
        )
        self.assertTrue(
            any("master_mapping_column_infopack" in query for query in database.queries)
        )
        self.assertNotIn(
            "FROM rekonsiliasi.master_mapping_column m",
            "\n".join(database.queries),
        )

    def test_reuses_first_header_for_every_existing_field_and_adds_new_fields(self):
        class FakeResult:
            def __init__(self, value=None, rows=()):
                self.value = value
                self.rows = rows

            def scalar_one(self):
                return self.value

            def mappings(self):
                return self

            def __iter__(self):
                return iter(self.rows)

        class FakeDatabase:
            def execute(self, query, parameters=None):
                query_text = str(query)
                if "SELECT EXISTS" in query_text:
                    return FakeResult(value=True)
                if "information_schema.columns" in query_text:
                    return FakeResult(
                        rows=[
                            {
                                "column_name": header,
                                "udt_name": "text",
                                "is_nullable": "YES",
                                "is_identity": "NO",
                                "column_default": None,
                            }
                            for header in ("CLAIM NO", "INSURED", "CLAIMS", "DOL")
                        ]
                    )
                return FakeResult(
                    rows=[
                        {"field_name": "loss_ref", "header_name": "CLAIM NO"},
                        {"field_name": "insured", "header_name": "INSURED"},
                        {"field_name": "gross", "header_name": "CLAIMS"},
                        {"field_name": "dol", "header_name": "DOL"},
                    ]
                )

        resolved = resolve_result_columns(
            FakeDatabase(),
            table_name="os_claim_infopack_aca",
            cedant_code="C001",
            mapping={
                "loss_ref": "Claim Ref",
                "insured": "Insured Name",
                "gross": "Outstanding",
                "dol": "Date of Loss",
                "policy_number": "Policy No",
            },
            catalog=[
                {"field_name": field, "default_source": "column", "data_type": "text"}
                for field in (
                    "loss_ref",
                    "insured",
                    "gross",
                    "dol",
                    "policy_number",
                )
            ],
            dataset_type="INFOPACK",
        )

        self.assertEqual(
            resolved,
            {
                "loss_ref": "CLAIM NO",
                "insured": "INSURED",
                "gross": "CLAIMS",
                "dol": "DOL",
                "policy_number": "Policy No",
            },
        )

    def test_first_result_headers_are_scoped_to_each_cedant(self):
        class FakeResult:
            def __init__(self, value=None, rows=()):
                self.value = value
                self.rows = rows

            def scalar_one(self):
                return self.value

            def mappings(self):
                return self

            def __iter__(self):
                return iter(self.rows)

        class FakeDatabase:
            headers_by_cedant = {
                "C001": [
                    {"field_name": "dol", "header_name": "DOL"},
                    {"field_name": "loss_ref", "header_name": "Claim No"},
                ],
                "C002": [
                    {"field_name": "dol", "header_name": "Date of Loss"},
                    {"field_name": "loss_ref", "header_name": "Claim Ref"},
                ],
            }

            def execute(self, query, parameters=None):
                query_text = str(query)
                if "SELECT EXISTS" in query_text:
                    return FakeResult(value=True)
                if "information_schema.columns" in query_text:
                    return FakeResult(
                        rows=[
                            {
                                "column_name": header,
                                "udt_name": "text",
                                "is_nullable": "YES",
                                "is_identity": "NO",
                                "column_default": None,
                            }
                            for header in (
                                "DOL",
                                "Claim No",
                                "Date of Loss",
                                "Claim Ref",
                            )
                        ]
                    )
                return FakeResult(
                    rows=self.headers_by_cedant[parameters["cedant_code"]]
                )

        catalog = [
            {"field_name": field, "default_source": "column", "data_type": "text"}
            for field in ("dol", "loss_ref")
        ]
        mapping = {"dol": "LossDate", "loss_ref": "Claim Number"}
        database = FakeDatabase()

        first_cedant = resolve_result_columns(
            database,
            table_name="os_claim_infopack_first",
            cedant_code="C001",
            mapping=mapping,
            catalog=catalog,
            dataset_type="INFOPACK",
        )
        second_cedant = resolve_result_columns(
            database,
            table_name="os_claim_infopack_second",
            cedant_code="C002",
            mapping=mapping,
            catalog=catalog,
            dataset_type="INFOPACK",
        )

        self.assertEqual(
            first_cedant,
            {"dol": "DOL", "loss_ref": "Claim No"},
        )
        self.assertEqual(
            second_cedant,
            {"dol": "Date of Loss", "loss_ref": "Claim Ref"},
        )


if __name__ == "__main__":
    unittest.main()
