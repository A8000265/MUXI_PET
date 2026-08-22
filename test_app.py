import json
import unittest
from app import app
from database import init_db, get_db_connection

class MuxiAppTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = app.test_client()

    def test_01_index_page(self):
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("沐曦".encode("utf-8"), res.data)

    def test_02_clean_pages(self):
        res_dog = self.client.get("/clean")
        self.assertEqual(res_dog.status_code, 200)
        self.assertIn("狗狗沙龍".encode("utf-8"), res_dog.data)

        res_cat = self.client.get("/clean2")
        self.assertEqual(res_cat.status_code, 200)
        self.assertIn("貓貓沙龍".encode("utf-8"), res_cat.data)

    def test_03_booking_page(self):
        res = self.client.get("/booking")
        self.assertEqual(res.status_code, 200)
        self.assertIn("寵物美容預約".encode("utf-8"), res.data)

    def test_04_pricing_api(self):
        res = self.client.get("/api/pricing")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertIn("小型犬", data["pricing"])
        self.assertEqual(data["pricing"]["小型犬"]["純清潔"], 350)
        self.assertEqual(data["pricing"]["小型犬"]["大美容"], 900)
        self.assertEqual(data["addons"]["除蚤藥浴"], 300)

    def test_05_member_validation(self):
        # 測試有效會員
        res = self.client.post("/api/members/validate", json={"member_id": "VIP001"})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["valid"])
        self.assertEqual(data["member"]["name"], "王小明")
        self.assertEqual(data["member"]["member_type"], "一般會員")

        # 測試無效會員
        res_invalid = self.client.post("/api/members/validate", json={"member_id": "NOT_EXIST"})
        self.assertEqual(res_invalid.status_code, 200)
        data_invalid = res_invalid.get_json()
        self.assertFalse(data_invalid["valid"])

    def test_06_create_booking_and_conflict(self):
        test_date = "2026-08-25"
        test_time = "15:00"

        # 第一次預約
        payload = {
            "booking_date": test_date,
            "time_slot": test_time,
            "owner_name": "測試主人",
            "owner_phone": "0911223344",
            "owner_email": "test@example.com",
            "pet_name": "樂樂",
            "pet_type": "小型犬",
            "service_type": "大美容",
            "addon_type": "深層護髮SPA",
            "member_type": "一般會員",
            "member_id": "VIP001"
        }

        res = self.client.post("/api/bookings", json=payload)
        self.assertIn(res.status_code, [201, 409])
        if res.status_code == 201:
            data = res.get_json()
            self.assertTrue(data["success"])
            self.assertEqual(data["booking"]["base_price"], 800)
            self.assertEqual(data["booking"]["addon_price"], 500)
            # 原價 1300，9折折抵 130 -> 1170
            self.assertEqual(data["booking"]["discount_amount"], 130)
            self.assertEqual(data["booking"]["total_price"], 1170)

        # 第二次重複預約同一個時段 -> 應回傳 409 Conflict
        res_dup = self.client.post("/api/bookings", json=payload)
        self.assertEqual(res_dup.status_code, 409)

    def test_07_admin_export_csv(self):
        res = self.client.get("/api/admin/export")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.mimetype, "text/csv")
        self.assertTrue(res.data.startswith(b'\xef\xbb\xbf')) # UTF-8 BOM

    def test_08_match_page(self):
        res = self.client.get("/match")
        self.assertEqual(res.status_code, 200)
        self.assertIn("毛孩速配".encode("utf-8"), res.data)

    def test_09_mbti_options_api(self):
        res = self.client.get("/api/mbti/options")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(len(data["mbti_profiles"]), 4)
        self.assertEqual(len(data["residence_options"]), 4)
        self.assertIn("country_options", data)
        self.assertGreaterEqual(len(data["country_options"]), 4)
        self.assertIn("zodiac_profiles", data)
        self.assertEqual(len(data["zodiac_profiles"]), 12)

    def test_10_mbti_match_api(self):
        payload = {
            "mbti": "INFP",
            "residence": "公寓/套房 (無院子)",
            "country": "台灣",
            "birthday": "2000-08-17",
            "zodiac": "獅子座"
        }
        res = self.client.post("/api/mbti/match", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertIsNotNone(data["match"])
        self.assertEqual(data["match"]["breed_name"], "英國短毛貓")
        self.assertEqual(data["match"]["pet_type"], "短毛貓")
        self.assertIn("country_advice", data)
        self.assertIn("台灣", data["country_advice"])
        self.assertIn("zodiac_advice", data)
        self.assertIn("獅子座", data["zodiac_advice"])
        self.assertGreaterEqual(data["match"]["match_score"], 90)
        self.assertIn("alternatives", data)
        self.assertGreaterEqual(len(data["alternatives"]), 1)

    def test_11_mbti_send_backup_api(self):
        payload = {
            "email": "customer@example.com",
            "owner_name": "王小明",
            "mbti": "INFP",
            "residence": "公寓/套房 (無院子)",
            "country": "台灣",
            "birthday": "2000-08-17",
            "zodiac": "獅子座",
            "match_data": {
                "breed_name": "英國短毛貓",
                "pet_type": "短毛貓",
                "title": "治癒系安靜守護者",
                "match_score": 98,
                "match_reason": "個性契合",
                "care_tips": "定期梳理"
            }
        }
        res = self.client.post("/api/mbti/send-backup", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertIn("customer@example.com", data["message"])

    def test_12_employee_login_and_auth(self):
        # 測試員工登入成功
        res = self.client.post("/api/employee/login", json={"emp_no": "EMP001", "password": "admin123"})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["employee"]["name"], "沐曦店長")

        # 測試狀態檢查
        res_status = self.client.get("/api/employee/status")
        self.assertEqual(res_status.status_code, 200)
        self.assertTrue(res_status.get_json()["logged_in"])

        # 測試錯誤密碼
        res_err = self.client.post("/api/employee/login", json={"emp_no": "EMP001", "password": "wrongpassword"})
        self.assertEqual(res_err.status_code, 401)

        # 測試登出
        res_logout = self.client.post("/api/employee/logout")
        self.assertEqual(res_logout.status_code, 200)

    def test_13_member_register_and_auth(self):
        import time
        unique_phone = f"0999{int(time.time()) % 1000000:06d}"
        payload = {
            "name": "測試新會員",
            "phone": unique_phone,
            "email": "newmember@example.com",
            "password": "mypassword123"
        }
        res = self.client.post("/api/member/register", json=payload)
        self.assertEqual(res.status_code, 201)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertIn("MUXI-M", data["member"]["member_id"])

        # 測試會員登入
        res_login = self.client.post("/api/member/login", json={"account": unique_phone, "password": "mypassword123"})
        self.assertEqual(res_login.status_code, 200)
        self.assertTrue(res_login.get_json()["success"])

        # 測試會員資格對比 API
        res_verify = self.client.post("/api/member/verify", json={"query": unique_phone})
        self.assertEqual(res_verify.status_code, 200)
        self.assertTrue(res_verify.get_json()["is_member"])

        # 測試會員名冊查詢
        res_list = self.client.get("/api/members/list")
        self.assertEqual(res_list.status_code, 200)
        self.assertTrue(res_list.get_json()["success"])

    def test_14_shopping_order_creation_and_tracking(self):
        payload = {
            "customer_name": "訂單測試人",
            "customer_phone": "0988776655",
            "customer_email": "buyer@example.com",
            "member_id": "GOLD888",
            "pickup_method": "門市自取 (高雄建工旗艦店)",
            "notes": "請於下午包裝",
            "items": [
                {"name": "法米納全齡犬-雞肉芒果", "spec": "1.5 kg", "price": 880, "qty": 2, "img": "DF7.jpg"}
            ]
        }
        res = self.client.post("/api/orders/create", json=payload)
        self.assertEqual(res.status_code, 201)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertIn("感謝顧客的購買與理解", data["notice"])
        self.assertIn("ORD-", data["order"]["order_no"])
        self.assertEqual(data["order"]["original_amount"], 1760)
        # 黃金會員 85折 -> 1760 * 0.15 = 264 discount -> total = 1496
        self.assertEqual(data["order"]["discount_amount"], 264)
        self.assertEqual(data["order"]["total_amount"], 1496)

        order_no = data["order"]["order_no"]

        # 測試後台訂單列表查詢
        res_orders = self.client.get("/api/orders/list")
        self.assertEqual(res_orders.status_code, 200)
        self.assertTrue(res_orders.get_json()["success"])

        # 測試後台更新訂單狀態
        res_up = self.client.post("/api/orders/update-status", json={"order_no": order_no, "status": "completed"})
        self.assertEqual(res_up.status_code, 200)
        self.assertTrue(res_up.get_json()["success"])

    def test_15_all_pages_routing(self):
        pages = [
            "/game.html", "/qa.html", "/clean.html", "/clean2.html",
            "/shop-dog.html", "/shop-cat.html", "/shop-snacks.html", "/shop-cans.html",
            "/product-detail.html", "/product-detail-salmon.html", "/product-detail-pork.html",
            "/stay-dog.html", "/stay-cat.html", "/gym.html", "/booking.html", "/admin.html"
        ]
        for page in pages:
            res = self.client.get(page)
            self.assertEqual(res.status_code, 200, f"Page {page} failed with {res.status_code}")

if __name__ == "__main__":
    unittest.main()

