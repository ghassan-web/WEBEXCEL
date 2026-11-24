import unittest

from app.services.cedant_result_schema import result_column_name


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


if __name__ == "__main__":
    unittest.main()
