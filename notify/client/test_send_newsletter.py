import contextlib
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import send_newsletter


class SendNewsletterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.newsletter = self.directory / "newsletter.md"
        self.newsletter.write_text("---\nsubject: Test\n---\nHello", encoding="utf-8")
        self.recipients = self.directory / "recipients.md"
        self.recipients.write_text(
            '"ONE@example.com\ntwo@example.com"\none@example.com\n',
            encoding="utf-8",
        )
        self.log = self.directory / ".newsletter.md.sent.log"

    def run_newsletter(self, *args):
        output = io.StringIO()
        errors = io.StringIO()
        with patch.object(sys, "argv", ["send_newsletter.py", str(self.newsletter), *args]):
            with contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
                result = send_newsletter.main()
        return result, output.getvalue(), errors.getvalue()

    def test_file_dry_run_deduplicates_without_fetching_subscribers(self):
        with patch.object(send_newsletter, "list_subscribers") as list_subscribers:
            result, output, _ = self.run_newsletter("--emails-file", str(self.recipients), "--dry-run")
        self.assertEqual(result, 0)
        self.assertEqual(output.count("  - one@example.com"), 1)
        self.assertEqual(output.count("  - two@example.com"), 1)
        self.assertFalse(self.log.exists())
        list_subscribers.assert_not_called()

    def test_file_send_records_success_and_skips_already_sent(self):
        self.log.write_text("ONE@example.com\n", encoding="utf-8")
        def fake_send(*, messages: list, delay_sec, progress_callback):
            for message in messages:
                self.assertEqual(message["unsub"], "")
                progress_callback(message["to"], True, None)
            self.assertEqual([message["to"] for message in messages], ["two@example.com"])

        with patch.object(send_newsletter, "list_subscribers") as list_subscribers, \
             patch.object(send_newsletter, "worker_base", return_value="https://example.com"), \
             patch.object(send_newsletter, "send_gmail_bulk", side_effect=fake_send), \
             patch("builtins.input", return_value="y"):
            result, _, _ = self.run_newsletter("--emails-file", str(self.recipients))
        self.assertEqual(result, 0)
        self.assertEqual(self.log.read_text(encoding="utf-8"), "ONE@example.com\ntwo@example.com\n")
        list_subscribers.assert_not_called()

    def test_missing_and_empty_files_fail_without_falling_back(self):
        for path in (self.directory / "missing.md", self.directory / "empty.md"):
            if path.name == "empty.md":
                path.write_text("sin correos", encoding="utf-8")
            with self.subTest(path=path), patch.object(send_newsletter, "list_subscribers") as list_subscribers:
                result, _, errors = self.run_newsletter("--emails-file", str(path))
                self.assertEqual(result, 1)
                self.assertIn("Error", errors)
                list_subscribers.assert_not_called()

    def test_file_and_test_emails_are_mutually_exclusive(self):
        with self.assertRaises(SystemExit) as error:
            self.run_newsletter("--emails-file", str(self.recipients), "--test-emails", "test@example.com")
        self.assertEqual(error.exception.code, 2)

    def test_test_emails_still_bypass_sent_log(self):
        self.log.write_text("test@example.com\n", encoding="utf-8")
        result, output, _ = self.run_newsletter("--test-emails", "test@example.com", "--dry-run")
        self.assertEqual(result, 0)
        self.assertIn("  - test@example.com", output)


if __name__ == "__main__":
    unittest.main()
