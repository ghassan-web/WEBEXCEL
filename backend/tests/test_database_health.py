import unittest
from unittest.mock import MagicMock, patch

from sqlalchemy.exc import SQLAlchemyError
from starlette.responses import Response

from app.main import health


class DatabaseHealthTests(unittest.TestCase):
    def test_reports_healthy_only_after_database_query_succeeds(self):
        connection = MagicMock()
        connection.__enter__.return_value.execute.return_value.scalar_one.return_value = 1
        response = Response()

        with patch("app.main.engine.connect", return_value=connection):
            result = health(response)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(result, {"status": "healthy", "database": "connected"})

    def test_reports_service_unhealthy_when_database_connection_fails(self):
        response = Response()

        with (
            patch("app.main.engine.connect", side_effect=SQLAlchemyError("offline")),
            patch("app.main.logger.exception"),
        ):
            result = health(response)

        self.assertEqual(response.status_code, 503)
        self.assertEqual(result, {"status": "unhealthy", "database": "disconnected"})


if __name__ == "__main__":
    unittest.main()
