import unittest

from scripts.check_ci_results import REQUIRED_JOBS, validate_results


class RequiredCheckTests(unittest.TestCase):
    def test_all_required_jobs_must_succeed(self):
        complete = {name: {"result": "success"} for name in REQUIRED_JOBS}
        self.assertEqual(validate_results(complete), [])
        for state in ("failure", "cancelled", "skipped", "pending", None):
            with self.subTest(state=state):
                self.assertTrue(validate_results({**complete, "browser": {"result": state}}))

    def test_missing_and_malformed_results_fail_closed(self):
        self.assertTrue(validate_results({}))
        self.assertTrue(validate_results([]))
        incomplete = {name: {"result": "success"} for name in REQUIRED_JOBS - {"ocr"}}
        self.assertTrue(validate_results(incomplete))
        self.assertTrue(validate_results({**incomplete, "ocr": {}}))
