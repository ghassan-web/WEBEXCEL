import unittest

from fastapi import HTTPException

from app.routers.master import (
    _build_os_mapping_profiles,
    _cedant_result_table_name,
    _has_cedant_result_values,
    _load_column_mapping,
    _raw_primary_key,
)


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


if __name__ == "__main__":
    unittest.main()
