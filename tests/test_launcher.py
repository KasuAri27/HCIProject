"""验证 README 主入口的服务识别和启动行为，避免打开真实浏览器。"""

import io
import unittest
from unittest.mock import patch

from launcher import launcher


class LauncherTests(unittest.TestCase):
    def test_reuses_only_our_health_endpoint(self):
        for payload, expected in (
            (b'{"app":"local-learning-assistant"}', True),
            (b'{"app":"another-service"}', False),
            (b'not json', False),
        ):
            with patch.object(launcher.urllib.request, "urlopen", return_value=io.BytesIO(payload)):
                self.assertEqual(launcher._server_running(), expected)

    def test_existing_server_opens_browser_without_starting_second_server(self):
        with patch.object(launcher, "_server_running", return_value=True):
            with patch.object(launcher, "_open_browser") as browser, patch.object(launcher.web, "run") as run:
                launcher.main()
        browser.assert_called_once()
        run.assert_not_called()

    def test_new_server_schedules_browser_and_starts_on_loopback(self):
        with patch.object(launcher, "_server_running", return_value=False):
            with patch.object(launcher.threading, "Timer") as timer, patch.object(launcher.web, "run") as run:
                launcher.main()
        timer.return_value.start.assert_called_once()
        run.assert_called_once_with(host="127.0.0.1", port=5000)
