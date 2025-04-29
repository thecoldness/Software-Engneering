import unittest
import json
import os
from tempfile import NamedTemporaryFile
from unittest.mock import patch

# 导入被测试的函数
from blast.parse_html_table import parse_html_table


class TestParseHtmlTable(unittest.TestCase):
    def setUp(self):
        """
        设置测试环境：创建一个模拟的 HTML 文件。
        """
        self.html_content = """
        <table>
            <thead>
                <tr>
                    <th>Player</th>
                    <th>Team</th>
                    <th>Kills</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><a href="/stats/players/123?foo=bar">Player1</a></td>
                    <td>TeamA</td>
                    <td>100</td>
                </tr>
                <tr>
                    <td><a href="/stats/players/456">Player2</a></td>
                    <td>TeamB</td>
                    <td>200</td>
                </tr>
            </tbody>
        </table>
        """
        # 创建临时 HTML 文件
        self.input_file = NamedTemporaryFile(mode="w+", encoding="utf-8", delete=False)
        self.input_file.write(self.html_content)
        self.input_file.close()

    def tearDown(self):
        """
        清理测试环境：删除临时文件。
        """
        if os.path.exists(self.input_file.name):
            os.remove(self.input_file.name)

    def test_parse_html_table_success(self):
        """
        测试正常情况下的解析逻辑。
        """
        with NamedTemporaryFile(mode="w+", encoding="utf-8", delete=False) as output_file:
            output_file_path = output_file.name

        # 调用函数
        parse_html_table(self.input_file.name, output_file_path)

        # 验证输出的 JSON 文件内容
        with open(output_file_path, "r", encoding="utf-8") as f:
            result = json.load(f)

        expected_data = {
            "Player1": {
                "Player": "Player1",
                "Team": "TeamA",
                "Kills": "100",
                "link": "https://www.hltv.org/players/123"
            },
            "Player2": {
                "Player": "Player2",
                "Team": "TeamB",
                "Kills": "200",
                "link": "https://www.hltv.org/players/456"
            }
        }
        self.assertEqual(result, expected_data)

        # 清理输出文件
        os.remove(output_file_path)

if __name__ == "__main__":
    unittest.main()