import io
import os
import csv
import re
import datetime
import random
from flask import Flask, render_template, request, jsonify, send_file, Response, redirect, url_for, session, send_from_directory
from config import Config
from database import get_db_connection, init_db

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config.from_object(Config)
app.secret_key = "muxi_secret_session_key_2026_secure"

ALL_SLOTS = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"]

import json
import threading
import smtplib
import urllib.request
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def _send_email_worker(to_email, subject, html_content):
    """真正執行發信的工作函式 (支援 Resend HTTPS API 與 Gmail SMTP 雙重引擎)"""
    if not to_email or "@" not in to_email:
        return False

    resend_api_key = os.getenv("RESEND_API_KEY", "").strip()
    mail_user = os.getenv("MAIL_USERNAME", "").strip()
    mail_pass = os.getenv("MAIL_PASSWORD", "").strip().replace(" ", "")
    sender_name = os.getenv("MAIL_SENDER_NAME", "沐曦 MuXi 寵物生活館")

    # 1. 優先使用 Resend 免費 HTTPS API (免除任何雲端防火牆通訊埠阻擋)
    if resend_api_key:
        try:
            payload = json.dumps({
                "from": "沐曦 MuXi <onboarding@resend.dev>",
                "to": [to_email],
                "subject": subject,
                "html": html_content
            }, ensure_ascii=False).encode("utf-8")

            req = urllib.request.Request(
                "https://api.resend.com/emails",
                data=payload,
                headers={
                    "Authorization": f"Bearer {resend_api_key}",
                    "Content-Type": "application/json; charset=utf-8",
                    "User-Agent": "MuXi-App"
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=6) as resp:
                res_data = json.loads(resp.read().decode("utf-8"))
                print(f"[Email Success (Resend API)] 成功寄出信件至: {to_email}, ID: {res_data.get('id')}")
                return True
        except Exception as e:
            print(f"[Email Resend Notice] {e}")

    # 2. 次選使用 Gmail SMTP (Port 587 TLS)
    if mail_user and mail_pass:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{sender_name} <{mail_user}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html_content, "html", "utf-8"))

        try:
            server = smtplib.SMTP("smtp.gmail.com", 587, timeout=5)
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(mail_user, mail_pass)
            server.sendmail(mail_user, [to_email], msg.as_string())
            server.quit()
            print(f"[Email Success (Port 587)] 成功寄出信件至: {to_email}")
            return True
        except Exception as e1:
            print(f"[Email Port 587 Fail] {e1}")

        try:
            server = smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=5)
            server.ehlo()
            server.login(mail_user, mail_pass)
            server.sendmail(mail_user, [to_email], msg.as_string())
            server.quit()
            print(f"[Email Success (Port 465 SSL)] 成功寄出信件至: {to_email}")
            return True
        except Exception as e2:
            print(f"[Email SMTP Fail] {e2}")

    print(f"[Email Notice] 尚未設定金鑰或網路連線逾時，已妥善紀錄: {to_email}")
    return False

def send_smtp_email(to_email, subject, html_content):
    """非同步非阻塞發送信件 (0.01 秒立即回傳前端，保證網頁絕不卡住)"""
    thread = threading.Thread(target=_send_email_worker, args=(to_email, subject, html_content), daemon=True)
    thread.start()
    return True

@app.route("/api/test-email", methods=["GET"])
def test_email_diagnostic():
    """診斷發信狀態 API (支援 Resend API 與 Gmail SMTP，5秒快速回傳)"""
    to_email = request.args.get("to", "a8000265@gmail.com").strip()
    resend_api_key = os.getenv("RESEND_API_KEY", "").strip()
    mail_user = os.getenv("MAIL_USERNAME", "").strip()
    mail_pass = os.getenv("MAIL_PASSWORD", "").strip().replace(" ", "")
    
    masked_user = (mail_user[:3] + "***@" + mail_user.split("@")[-1]) if "@" in mail_user else (mail_user or "未設定")
    
    diagnostic = {
        "target_email": to_email,
        "RESEND_API_KEY_found": bool(resend_api_key),
        "MAIL_USERNAME_found": bool(mail_user),
        "MAIL_USERNAME_preview": masked_user,
        "MAIL_PASSWORD_found": bool(mail_pass),
        "MAIL_PASSWORD_char_count": len(mail_pass),
        "attempts": []
    }

    # 1. 測試 Resend 免費 HTTPS API
    if resend_api_key:
        try:
            req = urllib.request.Request(
                "https://api.resend.com/emails",
                data=json.dumps({
                    "from": "沐曦 MuXi <onboarding@resend.dev>",
                    "to": [to_email],
                    "subject": "🐾【沐曦 MuXi】Resend HTTPS API 測試信件",
                    "html": f"<h2>🐾 沐曦 MuXi 雲端發信成功！</h2><p>親愛的測試者您好，這是一封透過 <b>Resend HTTPS API</b> 寄出的真實信件。<br>當您收到這封信時，代表系統發信功能已 100% 正常連線！</p>"
                }).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {resend_api_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "MuXi-App"
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                res_data = json.loads(resp.read().decode("utf-8"))
                diagnostic["attempts"].append({"method": "Resend HTTPS API", "status": "success", "id": res_data.get("id")})
                diagnostic["success"] = True
                diagnostic["message"] = f"🎉 恭喜！已成功透過 Resend HTTPS API 發送測試信至 {to_email}！請檢查您的信箱！"
                return jsonify(diagnostic), 200
        except Exception as e:
            diagnostic["attempts"].append({"method": "Resend HTTPS API", "status": "failed", "error": str(e)})

    # 2. 測試 Gmail SMTP
    if mail_user and mail_pass:
        try:
            server = smtplib.SMTP("smtp.gmail.com", 587, timeout=4)
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(mail_user, mail_pass)
            msg = MIMEText(f"<h2>🐾 沐曦 MuXi 郵件系統測試成功！</h2><p>親愛的測試者您好，這是一封來自 <b>{mail_user}</b> 的真實測試信件。<br>當您看到這封信時，代表網站的 Gmail SMTP 發信功能已 100% 正常連線成功！</p>", "html", "utf-8")
            msg["Subject"] = "🐾【沐曦 MuXi】Gmail SMTP 測試信件"
            msg["From"] = f"沐曦 MuXi 寵物生活館 <{mail_user}>"
            msg["To"] = to_email
            server.sendmail(mail_user, [to_email], msg.as_string())
            server.quit()
            diagnostic["attempts"].append({"method": "Gmail SMTP Port 587", "status": "success"})
            diagnostic["success"] = True
            diagnostic["message"] = f"🎉 恭喜！已成功透過 Gmail SMTP 發送測試信至 {to_email}！請檢查您的信箱！"
            return jsonify(diagnostic), 200
        except Exception as e1:
            diagnostic["attempts"].append({"method": "Gmail SMTP Port 587", "status": "failed", "error": str(e1)})

        try:
            server = smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=4)
            server.ehlo()
            server.login(mail_user, mail_pass)
            msg = MIMEText(f"<h2>🐾 沐曦 MuXi 郵件系統測試成功 (SSL)！</h2><p>親愛的測試者您好，這是一封來自 <b>{mail_user}</b> 的真實測試信件。<br>當您看到這封信時，代表網站的 Gmail SMTP (Port 465 SSL) 發信功能已 100% 正常連線成功！</p>", "html", "utf-8")
            msg["Subject"] = "🐾【沐曦 MuXi】Gmail SMTP (SSL) 測試信件"
            msg["From"] = f"沐曦 MuXi 寵物生活館 <{mail_user}>"
            msg["To"] = to_email
            server.sendmail(mail_user, [to_email], msg.as_string())
            server.quit()
            diagnostic["attempts"].append({"method": "Gmail SMTP Port 465 SSL", "status": "success"})
            diagnostic["success"] = True
            diagnostic["message"] = f"🎉 恭喜！已成功透過 Port 465 SSL 發送測試信至 {to_email}！請檢查您的信箱！"
            return jsonify(diagnostic), 200
        except Exception as e2:
            diagnostic["attempts"].append({"method": "Gmail SMTP Port 465 SSL", "status": "failed", "error": str(e2)})

    diagnostic["success"] = False
    if not mail_user or not mail_pass:
        diagnostic["error"] = "Render 環境變數中找不到 MAIL_USERNAME 或 MAIL_PASSWORD！請確認 Render 的 Environment 是否已儲存且變數名稱完全相符。"
    else:
        diagnostic["error"] = "Google 拒絕連線或驗證失敗。最常見原因是：16 位應用程式密碼錯誤，或者尚未在該 Gmail 開啟兩步驟驗證。"
    return jsonify(diagnostic), 400

# ==========================================
# 前端靜態資源與全頁面路由
# ==========================================

@app.route("/style.css")
def serve_root_style():
    """提供根目錄 style.css 請求"""
    return send_from_directory("static/css", "style.css")

@app.route("/")
@app.route("/index")
@app.route("/index.html")
def index():
    return render_template("index.html")

@app.route("/clean")
@app.route("/clean.html")
def clean():
    return render_template("clean.html")

@app.route("/clean2")
@app.route("/clean2.html")
def clean2():
    return render_template("clean2.html")

@app.route("/booking")
@app.route("/booking.html")
def booking():
    return render_template("booking.html")

@app.route("/game")
@app.route("/game.html")
def game():
    return render_template("game.html")

@app.route("/match")
@app.route("/match.html")
def match():
    return render_template("game.html")

@app.route("/qa")
@app.route("/qa.html")
def qa():
    return render_template("qa.html")

@app.route("/gym")
@app.route("/gym.html")
def gym():
    return render_template("gym.html")

@app.route("/stay-dog")
@app.route("/stay-dog.html")
def stay_dog():
    return render_template("stay-dog.html")

@app.route("/stay-cat")
@app.route("/stay-cat.html")
def stay_cat():
    return render_template("stay-cat.html")

@app.route("/shop-dog")
@app.route("/shop-dog.html")
def shop_dog():
    return render_template("shop-dog.html")

@app.route("/shop-cat")
@app.route("/shop-cat.html")
def shop_cat():
    return render_template("shop-cat.html")

@app.route("/shop-snacks")
@app.route("/shop-snacks.html")
def shop_snacks():
    return render_template("shop-snacks.html")

@app.route("/shop-cans")
@app.route("/shop-cans.html")
def shop_cans():
    return render_template("shop-cans.html")

@app.route("/admin")
@app.route("/admin.html")
def admin():
    return render_template("admin.html")

@app.route("/<path:page_name>")
def serve_any_page_or_asset(page_name):
    """通用頁面與圖片資源路由 (完整支援所有 30+ 頁面與圖片檔)"""
    # 1. 靜態資源與多媒體檔案支援 (圖片、影片、音訊、Lottie等)
    ext = os.path.splitext(page_name)[1].lower()
    media_extensions = [
        ".jpg", ".jpeg", ".png", ".webp", ".svg", ".gif", ".ico",
        ".mp4", ".webm", ".mov", ".mp3", ".wav", ".ogg",
        ".lottie", ".json", ".css", ".js", ".ttf", ".woff", ".woff2"
    ]
    if ext in media_extensions:
        if os.path.exists(os.path.join("static", "images", os.path.basename(page_name))):
            return send_from_directory("static/images", os.path.basename(page_name))
        if os.path.exists(os.path.join("static", page_name)):
            return send_from_directory("static", page_name)
        if os.path.exists(page_name):
            return send_from_directory(".", page_name)

    # 2. HTML 頁面支援
    html_name = page_name if page_name.endswith(".html") else f"{page_name}.html"
    if os.path.exists(os.path.join("templates", html_name)):
        return render_template(html_name)
    if os.path.exists(html_name):
        return render_template(html_name)

    return render_template("index.html")

# ==========================================
# RESTful API 端點
# ==========================================

@app.route("/api/pricing", methods=["GET"])
def get_pricing():
    """取得價目表規則與加購項目"""
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT pet_type, service_type, base_price, duration_hours FROM pricing_rules;")
            pricing_rows = cur.fetchall()

            cur.execute("SELECT name, price, description FROM addons;")
            addon_rows = cur.fetchall()

        conn.close()

        # 整理為便於前端取用的結構
        pricing_map = {}
        durations_map = {}
        for row in pricing_rows:
            p_type = row["pet_type"]
            s_type = row["service_type"]
            if p_type not in pricing_map:
                pricing_map[p_type] = {}
            pricing_map[p_type][s_type] = row["base_price"]
            durations_map[s_type] = row["duration_hours"]

        addons_map = {row["name"]: row["price"] for row in addon_rows}

        return jsonify({
            "success": True,
            "pricing": pricing_map,
            "addons": addons_map,
            "durations": durations_map,
            "addon_list": addon_rows,
            "all_slots": ALL_SLOTS
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/availability", methods=["GET"])
def get_availability():
    """查詢指定日期的時段預約狀況"""
    date_str = request.args.get("date")
    if not date_str:
        return jsonify({"success": False, "error": "缺少 date 參數 (格式: YYYY-MM-DD)"}), 400

    try:
        # 驗證日期格式
        datetime.date.fromisoformat(date_str)
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT time_slot, COUNT(*) as count 
                FROM bookings 
                WHERE booking_date = %s AND status != 'cancelled'
                GROUP BY time_slot;
            """, (date_str,))
            booked_rows = cur.fetchall()
        conn.close()

        # 每個時段目前設定上限為 1 位毛孩（確保高品質一對一服務）
        booked_slots = [row["time_slot"] for row in booked_rows if row["count"] >= 1]
        available_slots = [slot for slot in ALL_SLOTS if slot not in booked_slots]

        return jsonify({
            "success": True,
            "date": date_str,
            "all_slots": ALL_SLOTS,
            "booked_slots": booked_slots,
            "available_slots": available_slots,
            "is_full": len(available_slots) == 0
        })
    except ValueError:
        return jsonify({"success": False, "error": "無效的日期格式，請使用 YYYY-MM-DD"}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/members/validate", methods=["POST"])
def validate_member():
    """驗證會員編號有效性並返回折扣"""
    data = request.get_json() or {}
    member_id = data.get("member_id", "").strip()

    if not member_id:
        return jsonify({"success": False, "valid": False, "message": "請輸入會員編號"}), 400

    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT member_id, name, phone, email, member_type, discount_rate, status
                FROM members
                WHERE member_id = %s;
            """, (member_id,))
            member = cur.fetchone()
        conn.close()

        if not member:
            return jsonify({
                "success": True,
                "valid": False,
                "message": f"查無會員編號「{member_id}」，請確認是否輸入正確"
            })

        if member["status"] != "active":
            return jsonify({
                "success": True,
                "valid": False,
                "message": f"會員「{member_id}」目前處於非啟用狀態"
            })

        return jsonify({
            "success": True,
            "valid": True,
            "member": {
                "member_id": member["member_id"],
                "name": member["name"],
                "phone": member["phone"],
                "email": member["email"],
                "member_type": member["member_type"],
                "discount_rate": float(member["discount_rate"])
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/bookings", methods=["POST"])
def create_booking():
    """建立新的線上預約"""
    data = request.get_json() or {}

    booking_date = data.get("booking_date", "").strip()
    time_slot = data.get("time_slot", "").strip()
    owner_name = data.get("owner_name", "").strip()
    owner_phone = data.get("owner_phone", "").strip()
    owner_email = data.get("owner_email", "").strip()
    pet_name = data.get("pet_name", "").strip() or "未命名"
    pet_type = data.get("pet_type", "").strip()
    service_type = data.get("service_type", "").strip()
    stay_service = data.get("stay_service", "無").strip()
    stay_nights = int(data.get("stay_nights", 0)) if data.get("stay_nights") else 0
    addon_type = data.get("addon_type", "無").strip()
    member_type = data.get("member_type", "無").strip()
    member_id = data.get("member_id", "").strip() or None
    notes = data.get("notes", "").strip()

    # 必填欄位檢驗
    if not all([booking_date, time_slot, owner_name, owner_phone, owner_email, pet_type]):
        return jsonify({"success": False, "error": "請填寫所有必填欄位 (日期、時段、姓名、電話、信箱、寵物類別)"}), 400

    if not service_type and stay_service == "無":
        return jsonify({"success": False, "error": "請至少選擇一項服務 (美容、健身或住宿/安親)"}), 400

    if time_slot not in ALL_SLOTS:
        return jsonify({"success": False, "error": "選擇的時段無效"}), 400

    try:
        # 驗證日期不能為過去
        booking_dt = datetime.date.fromisoformat(booking_date)
        today = datetime.date.today()
        if booking_dt < today:
            return jsonify({"success": False, "error": "不能預約過去的日期"}), 400

        conn = get_db_connection()
        with conn.cursor() as cur:
            # 1. 檢查時段衝突 (同日期同時間是否已被預約)
            cur.execute("""
                SELECT id FROM bookings 
                WHERE booking_date = %s AND time_slot = %s AND status != 'cancelled'
                FOR UPDATE;
            """, (booking_date, time_slot))
            if cur.fetchone():
                conn.close()
                return jsonify({"success": False, "error": f"抱歉！{booking_date} {time_slot} 的時段剛好已被預約，請選擇其他時段！"}), 409

            # 2. 取得基本價格與時長
            base_price = 0
            duration_hours = 1
            if service_type and service_type != "無":
                cur.execute("""
                    SELECT base_price, duration_hours FROM pricing_rules 
                    WHERE pet_type = %s AND service_type = %s;
                """, (pet_type, service_type))
                pricing_rule = cur.fetchone()
                if pricing_rule:
                    base_price = pricing_rule["base_price"]
                    duration_hours = pricing_rule["duration_hours"]

            # 3. 取得加購價格
            addon_price = 0
            if addon_type and addon_type != "無":
                cur.execute("SELECT price FROM addons WHERE name = %s;", (addon_type,))
                addon_row = cur.fetchone()
                if addon_row:
                    addon_price = addon_row["price"]

            # 4. 會員折扣計算
            subtotal = base_price + addon_price
            discount_rate = 0.0
            if member_type != "無":
                if not member_id:
                    conn.close()
                    return jsonify({"success": False, "error": "選擇會員折扣時必須填寫會員編號"}), 400

                cur.execute("SELECT member_type, discount_rate, status FROM members WHERE member_id = %s;", (member_id,))
                mem_row = cur.fetchone()
                if not mem_row or mem_row["status"] != "active":
                    conn.close()
                    return jsonify({"success": False, "error": f"會員編號「{member_id}」驗證失敗，無法套用會員折扣"}), 400
                discount_rate = float(mem_row["discount_rate"])
                member_type = mem_row["member_type"]

            discount_amount = round(subtotal * (1.0 - discount_rate)) if discount_rate > 0 else 0
            total_price = subtotal - discount_amount

            # 5. 產生唯一預約編號
            date_prefix = booking_dt.strftime("%Y%m%d")
            rand_suffix = f"{random.randint(1000, 9999)}"
            booking_id = f"PET-{date_prefix}-{rand_suffix}"

            # 6. 寫入資料庫
            cur.execute("""
                INSERT INTO bookings (
                    booking_id, booking_date, time_slot, owner_name, owner_phone, owner_email,
                    pet_name, pet_type, service_type, stay_service, stay_nights, addon_type, member_type, member_id,
                    base_price, addon_price, discount_amount, total_price, estimated_duration,
                    status, notes
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'confirmed', %s);
            """, (
                booking_id, booking_date, time_slot, owner_name, owner_phone, owner_email,
                pet_name, pet_type, service_type or "純預約", stay_service, stay_nights, addon_type, member_type, member_id,
                base_price, addon_price, discount_amount, total_price, duration_hours, notes
            ))

        conn.close()

        # 發送預約確認通知信 (若有設定 SMTP 則自動寄發真實信件)
        try:
            booking_email_html = f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #FFE4D6; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                <div style="background: #FE7000; color: #FFF; padding: 22px; text-align: center;">
                    <h2 style="margin: 0; font-size: 22px;">🐾 沐曦 MuXi 寵物預約確認通知函</h2>
                </div>
                <div style="padding: 24px; color: #333; line-height: 1.6;">
                    <p>親愛的 <b>{owner_name}</b> 您好：</p>
                    <p>感謝您預約沐曦寵物生活館服務，以下是您的預約明細：</p>
                    <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
                        <tr style="border-bottom: 1px solid #EEE;"><td style="padding: 8px 0; color: #666;">預約編號</td><td style="font-weight: bold; color: #FE7000;">{booking_id}</td></tr>
                        <tr style="border-bottom: 1px solid #EEE;"><td style="padding: 8px 0; color: #666;">毛孩姓名 / 體型</td><td><b>{pet_name}</b> ({pet_type})</td></tr>
                        <tr style="border-bottom: 1px solid #EEE;"><td style="padding: 8px 0; color: #666;">預約時段</td><td><b>{booking_date} {time_slot}</b></td></tr>
                        <tr style="border-bottom: 1px solid #EEE;"><td style="padding: 8px 0; color: #666;">美容項目</td><td>{service_type}</td></tr>
                        <tr style="border-bottom: 1px solid #EEE;"><td style="padding: 8px 0; color: #666;">住宿/加購項目</td><td>{stay_service} / {addon_type}</td></tr>
                        <tr style="border-bottom: 1px solid #EEE;"><td style="padding: 8px 0; color: #666;">預計總金額</td><td style="font-weight: bold; font-size: 18px; color: #FE7000;">NT$ {total_price:,}</td></tr>
                    </table>
                    <p style="background: #FFF8F0; padding: 12px 16px; border-left: 4px solid #FE7000; border-radius: 4px; font-size: 13px; color: #666;">
                        💡 貼心提醒：請於預約時間前 5~10 分鐘抵達門市，若需更改或取消預約，請隨時於網站查詢或來電告知。
                    </p>
                    <p style="text-align: center; margin-top: 25px; font-size: 12px; color: #999;">沐曦 MuXi 寵物生活館 敬上</p>
                </div>
            </div>
            """
            send_smtp_email(owner_email, f"【沐曦 MuXi】寵物服務預約確認 ({booking_id})", booking_email_html)
        except Exception:
            pass

        return jsonify({
            "success": True,
            "message": "預約成功！",
            "booking": {
                "booking_id": booking_id,
                "booking_date": booking_date,
                "time_slot": time_slot,
                "owner_name": owner_name,
                "owner_phone": owner_phone,
                "owner_email": owner_email,
                "pet_name": pet_name,
                "pet_type": pet_type,
                "service_type": service_type,
                "addon_type": addon_type,
                "member_type": member_type,
                "member_id": member_id,
                "base_price": base_price,
                "addon_price": addon_price,
                "discount_amount": discount_amount,
                "total_price": total_price,
                "estimated_duration": duration_hours,
                "status": "confirmed"
            }
        }), 201
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/bookings", methods=["GET"])
def list_bookings():
    """查詢所有預約清單 (後台用，支援依日期、關鍵字篩選，並自動對比會員資格)"""
    date_filter = request.args.get("date", "").strip()
    status_filter = request.args.get("status", "").strip()
    search_keyword = request.args.get("q", "").strip()

    query = "SELECT * FROM bookings WHERE 1=1"
    params = []

    if date_filter:
        query += " AND booking_date = %s"
        params.append(date_filter)
    if status_filter:
        query += " AND status = %s"
        params.append(status_filter)
    if search_keyword:
        query += " AND (owner_name LIKE %s OR owner_phone LIKE %s OR booking_id LIKE %s OR pet_name LIKE %s)"
        like_pattern = f"%{search_keyword}%"
        params.extend([like_pattern, like_pattern, like_pattern, like_pattern])

    query += " ORDER BY booking_date DESC, time_slot ASC"

    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(query, tuple(params))
            bookings = cur.fetchall()

            # 自動對比會員資格
            for b in bookings:
                cur.execute("""
                    SELECT member_id, name, member_type, discount_rate 
                    FROM members 
                    WHERE phone = %s OR email = %s OR member_id = %s;
                """, (b["owner_phone"], b["owner_email"], b.get("member_id")))
                matched = cur.fetchone()
                if matched:
                    b["is_verified_member"] = True
                    b["verified_member_id"] = matched["member_id"]
                    b["verified_member_type"] = matched["member_type"]
                else:
                    b["is_verified_member"] = False
                    b["verified_member_id"] = None
                    b["verified_member_type"] = "一般訪客"

        conn.close()

        # 格式化日期與數值
        for b in bookings:
            if isinstance(b.get("booking_date"), (datetime.date, datetime.datetime)):
                b["booking_date"] = b["booking_date"].strftime("%Y-%m-%d")
            if isinstance(b.get("created_at"), (datetime.date, datetime.datetime)):
                b["created_at"] = b["created_at"].strftime("%Y-%m-%d %H:%M:%S")

        return jsonify({"success": True, "count": len(bookings), "bookings": bookings})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/bookings/<booking_id>", methods=["PATCH"])
def update_booking_status(booking_id):
    """更新預約狀態 (例如取消或標記完成)"""
    data = request.get_json() or {}
    new_status = data.get("status")
    notes = data.get("notes")

    if new_status and new_status not in ["confirmed", "completed", "cancelled"]:
        return jsonify({"success": False, "error": "無效的狀態值"}), 400

    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            updates = []
            params = []
            if new_status:
                updates.append("status = %s")
                params.append(new_status)
            if notes is not None:
                updates.append("notes = %s")
                params.append(notes)

            if not updates:
                conn.close()
                return jsonify({"success": False, "error": "沒有提供要更新的欄位"}), 400

            params.append(booking_id)
            sql = f"UPDATE bookings SET {', '.join(updates)} WHERE booking_id = %s;"
            cur.execute(sql, tuple(params))
            affected = cur.rowcount

        conn.close()

        if affected == 0:
            return jsonify({"success": False, "error": f"找不到預約編號 {booking_id}"}), 404

        return jsonify({"success": True, "message": f"預約 {booking_id} 狀態已更新為 {new_status}"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ==========================================
# 員工後台驗證 API
# ==========================================

@app.route("/api/employee/login", methods=["POST"])
def employee_login():
    """員工登入驗證 (需輸入員工編號與密碼)"""
    data = request.get_json() or {}
    emp_no = data.get("emp_no", "").strip()
    password = data.get("password", "").strip()

    if not emp_no or not password:
        return jsonify({"success": False, "error": "請輸入員工編號與密碼"}), 400

    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT emp_no, name, role, status FROM employees 
                WHERE emp_no = %s AND password = %s;
            """, (emp_no, password))
            emp = cur.fetchone()
        conn.close()

        if not emp or emp["status"] != "active":
            return jsonify({"success": False, "error": "員工編號或密碼錯誤，請確認後重試！"}), 401

        session["employee"] = {
            "emp_no": emp["emp_no"],
            "name": emp["name"],
            "role": emp["role"]
        }

        return jsonify({
            "success": True,
            "message": f"歡迎回來，{emp['name']} ({emp['role']})！",
            "employee": session["employee"]
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/employee/logout", methods=["POST"])
def employee_logout():
    """員工登出"""
    session.pop("employee", None)
    return jsonify({"success": True, "message": "員工已安全登出"})


@app.route("/api/employee/status", methods=["GET"])
def employee_status():
    """取得員工目前登入狀態"""
    emp = session.get("employee")
    return jsonify({
        "success": True,
        "logged_in": emp is not None,
        "employee": emp
    })


# ==========================================
# 會員註冊、登入與資格對比 API
# ==========================================

@app.route("/api/member/register", methods=["POST"])
def member_register():
    """顧客註冊會員"""
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    phone = data.get("phone", "").strip()
    email = data.get("email", "").strip()
    password = data.get("password", "").strip() or "123456"

    if not name or not phone:
        return jsonify({"success": False, "error": "請輸入姓名與手機號碼！"}), 400

    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # 檢查手機是否已註冊
            cur.execute("SELECT member_id, name FROM members WHERE phone = %s;", (phone,))
            if cur.fetchone():
                conn.close()
                return jsonify({"success": False, "error": f"手機號碼 {phone} 已經註冊過會員！請直接登入"}), 409

            # 產生新會員編號
            cur.execute("SELECT COUNT(*) as cnt FROM members;")
            cnt = cur.fetchone()["cnt"] + 1
            member_id = f"MUXI-M{cnt:04d}"

            cur.execute("""
                INSERT INTO members (member_id, name, phone, email, password, member_type, discount_rate)
                VALUES (%s, %s, %s, %s, %s, '一般會員', 0.90);
            """, (member_id, name, phone, email, password))

        conn.close()

        session["member"] = {
            "member_id": member_id,
            "name": name,
            "phone": phone,
            "email": email,
            "member_type": "一般會員",
            "discount_rate": 0.90
        }

        return jsonify({
            "success": True,
            "message": f"🎉 恭喜註冊成功！您的專屬會員編號為【{member_id}】",
            "member": session["member"]
        }), 201
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/member/login", methods=["POST"])
def member_login():
    """會員登入 (支援 會員編號 / 手機 / Email + 密碼)"""
    data = request.get_json() or {}
    account = data.get("account", "").strip()
    password = data.get("password", "").strip()

    if not account:
        return jsonify({"success": False, "error": "請輸入會員編號、手機或 Email"}), 400

    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT member_id, name, phone, email, password, member_type, discount_rate, status
                FROM members
                WHERE (member_id = %s OR phone = %s OR email = %s);
            """, (account, account, account))
            mem = cur.fetchone()
        conn.close()

        if not mem or mem["status"] != "active":
            return jsonify({"success": False, "error": "查無此會員帳號，請先註冊！"}), 404

        if password and mem.get("password") and mem["password"] != password:
            return jsonify({"success": False, "error": "密碼錯誤，請重新輸入！"}), 401

        session["member"] = {
            "member_id": mem["member_id"],
            "name": mem["name"],
            "phone": mem["phone"],
            "email": mem["email"],
            "member_type": mem["member_type"],
            "discount_rate": float(mem["discount_rate"])
        }

        return jsonify({
            "success": True,
            "message": f"歡迎回來，{mem['name']} ({mem['member_type']})！",
            "member": session["member"]
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/member/logout", methods=["POST"])
def member_logout():
    """會員登出"""
    session.pop("member", None)
    return jsonify({"success": True, "message": "會員已成功登出"})


@app.route("/api/member/me", methods=["GET"])
def member_me():
    """取得目前登入之會員資訊"""
    mem = session.get("member")
    return jsonify({
        "success": True,
        "logged_in": mem is not None,
        "member": mem
    })


@app.route("/api/member/verify", methods=["POST"])
def member_verify():
    """即時對比顧客是否為已認證會員 (輸入手機、Email 或 會員編號)"""
    data = request.get_json() or {}
    query = data.get("query", "").strip()

    if not query:
        return jsonify({"success": False, "is_member": False, "message": "請輸入查詢條件"})

    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT member_id, name, phone, email, member_type, discount_rate, status
                FROM members
                WHERE (member_id = %s OR phone = %s OR email = %s) AND status = 'active';
            """, (query, query, query))
            mem = cur.fetchone()
        conn.close()

        if mem:
            return jsonify({
                "success": True,
                "is_member": True,
                "member": {
                    "member_id": mem["member_id"],
                    "name": mem["name"],
                    "phone": mem["phone"],
                    "email": mem["email"],
                    "member_type": mem["member_type"],
                    "discount_rate": float(mem["discount_rate"])
                }
            })
        return jsonify({
            "success": True,
            "is_member": False,
            "message": "查無此會員編號，將以一般訪客身份登記"
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/members/list", methods=["GET"])
def members_list():
    """取得所有會員名單 (員工後台專用，附帶累積消費/預約統計)"""
    search = request.args.get("q", "").strip()
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            sql = """
                SELECT m.member_id, m.name, m.phone, m.email, m.member_type, m.discount_rate, m.status, m.created_at,
                   (SELECT COUNT(*) FROM bookings b WHERE b.member_id = m.member_id OR b.owner_phone = m.phone) as booking_count,
                   (SELECT COUNT(*) FROM orders o WHERE o.member_id = m.member_id OR o.customer_phone = m.phone) as order_count
                FROM members m WHERE 1=1
            """
            params = []
            if search:
                sql += " AND (m.member_id LIKE %s OR m.name LIKE %s OR m.phone LIKE %s OR m.email LIKE %s)"
                pat = f"%{search}%"
                params.extend([pat, pat, pat, pat])
            sql += " ORDER BY m.created_at DESC;"
            cur.execute(sql, tuple(params))
            members = cur.fetchall()
        conn.close()

        for m in members:
            if isinstance(m.get("created_at"), (datetime.date, datetime.datetime)):
                m["created_at"] = m["created_at"].strftime("%Y-%m-%d %H:%M")
            m["discount_rate"] = float(m["discount_rate"])

        return jsonify({"success": True, "members": members, "count": len(members)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ==========================================
# 商城購物車與結帳下單 API (含非線上付款提示與備份寄送)
# ==========================================

@app.route("/api/orders/create", methods=["POST"])
def create_order():
    """建立商城購物訂單 (離線到店付款，含道歉感謝提示與信箱備份)"""
    data = request.get_json() or {}
    customer_name = data.get("customer_name", "").strip()
    customer_phone = data.get("customer_phone", "").strip()
    customer_email = data.get("customer_email", "").strip()
    member_id = data.get("member_id", "").strip() or None
    items = data.get("items", [])
    pickup_method = data.get("pickup_method", "門市自取").strip()
    notes = data.get("notes", "").strip()

    if not customer_name or not customer_phone or not customer_email or not items:
        return jsonify({"success": False, "error": "請填寫完整訂購人姓名、電話、信箱並至少選購一項商品！"}), 400

    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # 檢查會員資格與折扣
            discount_rate = 1.0
            member_type = "一般訪客"
            if member_id:
                cur.execute("SELECT member_id, member_type, discount_rate FROM members WHERE member_id = %s;", (member_id,))
                mem = cur.fetchone()
                if mem:
                    discount_rate = float(mem["discount_rate"])
                    member_type = mem["member_type"]
            else:
                # 自動對比手機或 Email
                cur.execute("SELECT member_id, member_type, discount_rate FROM members WHERE phone = %s OR email = %s;", (customer_phone, customer_email))
                mem = cur.fetchone()
                if mem:
                    member_id = mem["member_id"]
                    discount_rate = float(mem["discount_rate"])
                    member_type = mem["member_type"]

            orig_total = 0
            for it in items:
                price = int(it.get("price", 0))
                qty = int(it.get("qty", 1))
                orig_total += price * qty

            discount_amount = int(round(orig_total * (1.0 - discount_rate)))
            total_amount = orig_total - discount_amount

            # 產生訂單編號
            today_str = datetime.date.today().strftime("%Y%m%d")
            rand_num = random.randint(1000, 9999)
            order_no = f"ORD-{today_str}-{rand_num}"

            # 寫入 orders 資料表
            cur.execute("""
                INSERT INTO orders (
                    order_no, customer_name, customer_phone, customer_email, member_id, member_type,
                    original_amount, discount_amount, total_amount, pickup_method, payment_status, status, notes
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, '到店付款 (暫不接受線上付款)', 'pending_pickup', %s);
            """, (order_no, customer_name, customer_phone, customer_email, member_id, member_type,
                  orig_total, discount_amount, total_amount, pickup_method, notes))

            # 寫入 order_items 資料表
            for it in items:
                p_name = it.get("name", "商品")
                spec = it.get("spec", "標準規格")
                price = int(it.get("price", 0))
                qty = int(it.get("qty", 1))
                sub = price * qty
                img = it.get("img", "")
                cur.execute("""
                    INSERT INTO order_items (order_no, product_name, spec, unit_price, quantity, subtotal, image_url)
                    VALUES (%s, %s, %s, %s, %s, %s, %s);
                """, (order_no, p_name, spec, price, qty, sub, img))

        conn.close()

        offline_notice = "【感謝顧客的購買與理解，對於無法線上付款這件事情深感抱歉，後續會再做出系統上的更新】"

        # 發送商城訂單確認通知信 (若有設定 SMTP 則自動發送真實信件)
        try:
            items_html = "".join([
                f"<tr style='border-bottom: 1px solid #EEE;'><td style='padding: 8px 0;'>{item.get('name', '商品')} ({item.get('spec', '標準')})</td><td style='text-align: center;'>x{item.get('qty', 1)}</td><td style='text-align: right;'>NT$ {int(item.get('price', 0)) * int(item.get('qty', 1)):,}</td></tr>"
                for item in items
            ])
            order_email_html = f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                <div style="background: #111827; color: #FFF; padding: 22px; text-align: center;">
                    <h2 style="margin: 0; font-size: 22px;">🛍️ 沐曦 MuXi 線上商城訂單確認通知</h2>
                </div>
                <div style="padding: 24px; color: #333; line-height: 1.6;">
                    <p>親愛的 <b>{customer_name}</b> 您好：</p>
                    <p>我們已收到您的商城預訂商品訂單！明細如下：</p>
                    <p><b>訂單編號：</b><span style="color: #4F46E5; font-weight: bold;">{order_no}</span></p>
                    <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
                        <tr style="background: #F3F4F6; color: #374151; font-weight: bold;"><th style="padding: 8px; text-align: left;">商品名稱</th><th style="padding: 8px; text-align: center;">數量</th><th style="padding: 8px; text-align: right;">小計</th></tr>
                        {items_html}
                        <tr><td colspan="2" style="padding: 12px 0; font-weight: bold; border-top: 2px solid #E5E7EB;">總計金額 ({member_type})</td><td style="padding: 12px 0; text-align: right; font-weight: bold; font-size: 18px; color: #4F46E5; border-top: 2px solid #E5E7EB;">NT$ {total_amount:,}</td></tr>
                    </table>
                    <p style="background: #FEF3C7; padding: 12px 16px; border-radius: 6px; font-size: 13px; color: #92400E; border: 1px solid #FDE68A;">
                        📌 取貨方式：門市自取｜付款方式：到店付款 (暫不接受線上付款)<br>
                        門市人員將為您備貨，請於 3 日內至沐曦門市出示此信件或訂單編號領取。
                    </p>
                    <p style="text-align: center; margin-top: 25px; font-size: 12px; color: #999;">沐曦 MuXi 寵物生活館 敬上</p>
                </div>
            </div>
            """
            send_smtp_email(customer_email, f"【沐曦 MuXi】商城訂單成立通知 ({order_no})", order_email_html)
        except Exception:
            pass

        return jsonify({
            "success": True,
            "message": "下單成功！已發送訂單備份至您的電子信箱！",
            "notice": offline_notice,
            "order": {
                "order_no": order_no,
                "customer_name": customer_name,
                "customer_phone": customer_phone,
                "customer_email": customer_email,
                "member_id": member_id,
                "member_type": member_type,
                "original_amount": orig_total,
                "discount_amount": discount_amount,
                "total_amount": total_amount,
                "pickup_method": pickup_method,
                "payment_status": "到店取貨付款 (暫無線上刷卡)",
                "items": items,
                "created_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
        }), 201
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/orders/list", methods=["GET"])
def list_orders():
    """查詢所有購物訂單清單 (後台用，含明細與會員比對)"""
    status = request.args.get("status", "").strip()
    search = request.args.get("q", "").strip()

    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            sql = "SELECT * FROM orders WHERE 1=1"
            params = []
            if status:
                sql += " AND status = %s"
                params.append(status)
            if search:
                sql += " AND (order_no LIKE %s OR customer_name LIKE %s OR customer_phone LIKE %s OR customer_email LIKE %s)"
                pat = f"%{search}%"
                params.extend([pat, pat, pat, pat])
            sql += " ORDER BY created_at DESC;"
            cur.execute(sql, tuple(params))
            orders = cur.fetchall()

            for o in orders:
                cur.execute("SELECT * FROM order_items WHERE order_no = %s;", (o["order_no"],))
                o["items"] = cur.fetchall()
                if isinstance(o.get("created_at"), (datetime.date, datetime.datetime)):
                    o["created_at"] = o["created_at"].strftime("%Y-%m-%d %H:%M:%S")

                # 自動對比會員資格
                cur.execute("SELECT member_id, member_type FROM members WHERE phone = %s OR email = %s;", (o["customer_phone"], o["customer_email"]))
                matched = cur.fetchone()
                if matched:
                    o["is_verified_member"] = True
                    o["verified_member_id"] = matched["member_id"]
                    o["verified_member_type"] = matched["member_type"]
                else:
                    o["is_verified_member"] = False
                    o["verified_member_id"] = None
                    o["verified_member_type"] = "一般訪客"

        conn.close()
        return jsonify({"success": True, "orders": orders, "count": len(orders)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/orders/update-status", methods=["POST"])
def update_order_status():
    """更新訂單狀態 (待取貨 / 已取貨完成 / 已取消)"""
    data = request.get_json() or {}
    order_no = data.get("order_no")
    status = data.get("status")

    if not order_no or status not in ["pending_pickup", "completed", "cancelled"]:
        return jsonify({"success": False, "error": "無效的訂單狀態參數"}), 400

    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("UPDATE orders SET status = %s WHERE order_no = %s;", (status, order_no))
            affected = cur.rowcount
        conn.close()

        if affected == 0:
            return jsonify({"success": False, "error": f"找不到訂單編號 {order_no}"}), 404

        return jsonify({"success": True, "message": f"訂單 {order_no} 狀態已更新為 {status}"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/admin/stats", methods=["GET"])
def get_admin_stats():
    """取得後台營運概況統計 (預約 + 商城訂單 + 會員總數)"""
    today_str = datetime.date.today().strftime("%Y-%m-%d")
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # 總預約數與今日預約數
            cur.execute("SELECT COUNT(*) as total_bookings FROM bookings;")
            total_bookings = cur.fetchone()["total_bookings"]

            cur.execute("SELECT COUNT(*) as today_bookings FROM bookings WHERE booking_date = %s AND status != 'cancelled';", (today_str,))
            today_bookings = cur.fetchone()["today_bookings"]

            # 總訂單數與待處理訂單數
            cur.execute("SELECT COUNT(*) as total_orders FROM orders;")
            total_orders = cur.fetchone()["total_orders"]

            cur.execute("SELECT COUNT(*) as pending_orders FROM orders WHERE status = 'pending_pickup';")
            pending_orders = cur.fetchone()["pending_orders"]

            # 累積營業額 (預約 + 訂單)
            cur.execute("SELECT SUM(total_price) as b_rev FROM bookings WHERE status != 'cancelled';")
            b_rev = int(cur.fetchone()["b_rev"] or 0)

            cur.execute("SELECT SUM(total_amount) as o_rev FROM orders WHERE status != 'cancelled';")
            o_rev = int(cur.fetchone()["o_rev"] or 0)
            total_revenue = b_rev + o_rev

            # 會員總數
            cur.execute("SELECT COUNT(*) as total_members FROM members WHERE status = 'active';")
            total_members = cur.fetchone()["total_members"]

        conn.close()

        return jsonify({
            "success": True,
            "stats": {
                "total_bookings": total_bookings,
                "today_bookings": today_bookings,
                "total_orders": total_orders,
                "pending_orders": pending_orders,
                "total_revenue": total_revenue,
                "total_members": total_members,
                "today_date": today_str
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/admin/export", methods=["GET"])
@app.route("/api/admin/export/csv", methods=["GET"])
def export_csv():
    """匯出所有預約資料為包含 UTF-8 BOM 的 Excel/CSV 檔案"""
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 
                    created_at, booking_id, booking_date, time_slot,
                    owner_name, owner_phone, owner_email,
                    pet_name, pet_type, service_type, addon_type,
                    member_type, IFNULL(member_id, '無') as member_id,
                    base_price, addon_price, discount_amount, total_price,
                    status, IFNULL(notes, '') as notes
                FROM bookings
                ORDER BY booking_date DESC, time_slot ASC;
            """)
            rows = cur.fetchall()
        conn.close()

        # 建立 CSV 內容 (使用 StringIO 與 UTF-8 BOM)
        output = io.StringIO()
        output.write('\ufeff') # UTF-8 BOM，讓 Microsoft Excel 正確識別中文
        writer = csv.writer(output)

        # 欄位標題
        headers = [
            "建立時間", "預約編號", "預約日期", "時段",
            "主人姓名", "聯絡電話", "電子信箱",
            "寵物名字", "寵物類別", "服務項目", "加購服務",
            "會員身分", "會員編號",
            "基本價格", "加購價格", "折扣金額", "預估總價",
            "預約狀態", "備註"
        ]
        writer.writerow(headers)

        status_trans = {
            "confirmed": "已預約",
            "completed": "已完成",
            "cancelled": "已取消"
        }

        for row in rows:
            created_str = row["created_at"].strftime("%Y-%m-%d %H:%M:%S") if isinstance(row["created_at"], (datetime.date, datetime.datetime)) else str(row["created_at"])
            date_str = row["booking_date"].strftime("%Y-%m-%d") if isinstance(row["booking_date"], (datetime.date, datetime.datetime)) else str(row["booking_date"])
            
            writer.writerow([
                created_str,
                row["booking_id"],
                date_str,
                row["time_slot"],
                row["owner_name"],
                row["owner_phone"],
                row["owner_email"],
                row["pet_name"],
                row["pet_type"],
                row["service_type"],
                row["addon_type"],
                row["member_type"],
                row["member_id"],
                row["base_price"],
                row["addon_price"],
                row["discount_amount"],
                row["total_price"],
                status_trans.get(row["status"], row["status"]),
                row["notes"]
            ])

        output.seek(0)
        filename = f"沐曦寵物美容預約報表_{datetime.date.today().strftime('%Y%m%d')}.csv"

        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"}
        )
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ==========================================
# MBTI 毛孩速配 API 端點
# ==========================================

MBTI_PROFILES = [
    {
        "group": "外交家 (NF)",
        "color": "#00A85A",
        "types": [
            {"code": "INFP", "name": "調停者", "tag": "溫柔理想、同理心高", "desc": "安靜敏感、重視心靈契合與個人自由空間"},
            {"code": "ENFP", "name": "競選者", "tag": "熱情奔放、充滿好奇", "desc": "樂觀開朗、喜愛探索與分享生活的冒險家"},
            {"code": "INFJ", "name": "提倡者", "tag": "深思熟慮、神秘洞察", "desc": "低調安靜、重視深刻情感連結與彼此信任"},
            {"code": "ENFJ", "name": "主人公", "tag": "天生領袖、溫暖鼓舞", "desc": "關懷他人、極具愛心與社交魅力的守護者"}
        ]
    },
    {
        "group": "分析家 (NT)",
        "color": "#9333EA",
        "types": [
            {"code": "INTJ", "name": "建築師", "tag": "獨立戰略、冷靜理智", "desc": "條理分明、講究生活秩序、不喜無謂打擾"},
            {"code": "INTP", "name": "邏輯學家", "tag": "奇思妙想、自主探索", "desc": "專注內心世界、喜愛自得其樂的獨立夥伴"},
            {"code": "ENTJ", "name": "指揮官", "tag": "果斷霸氣、領導風範", "desc": "目標明確、欣賞自信勇敢與高度紀律的毛孩"},
            {"code": "ENTP", "name": "辯論家", "tag": "智力挑戰、機智敏捷", "desc": "鬼點子多、熱愛互動遊戲與高智商夥伴"}
        ]
    },
    {
        "group": "守護者 (SJ)",
        "color": "#001EFE",
        "types": [
            {"code": "ISTJ", "name": "物流師", "tag": "一絲不苟、沉穩守規", "desc": "作息規律、有原則、重視忠誠與安寧環境"},
            {"code": "ISFJ", "name": "守衛者", "tag": "體貼奉獻、溫柔照顧", "desc": "細心顧家、熱愛陪伴與呵護身邊的每個生命"},
            {"code": "ESTJ", "name": "總經理", "tag": "嚴謹秩序、忠誠可靠", "desc": "責任感強、重視家庭安全與紀律服從"},
            {"code": "ESFJ", "name": "執政官", "tag": "熱情好客、社交中心", "desc": "喜歡熱鬧、熱愛與毛孩同樂並分享給身邊所有人"}
        ]
    },
    {
        "group": "探險家 (SP)",
        "color": "#FE7000",
        "types": [
            {"code": "ISFP", "name": "探險家", "tag": "優雅感性、隨遇而安", "desc": "具藝術家氣質、享受寧靜美感與自然互動"},
            {"code": "ISTP", "name": "鑑賞家", "tag": "冷靜敏捷、自由酷炫", "desc": "動靜皆宜、尊重彼此獨立空間與低干擾生活"},
            {"code": "ESTP", "name": "企業家", "tag": "活力無限、熱愛冒險", "desc": "行動派、熱愛戶外奔馳與充滿能量的玩樂"},
            {"code": "ESFP", "name": "表演者", "tag": "派對巨星、歡樂不斷", "desc": "開朗大方、把生活過成嘉年華的開心果"}
        ]
    }
]

RESIDENCE_OPTIONS = [
    {"id": "公寓/套房 (無院子)", "name": "公寓 / 套房 (無院子)", "desc": "室內空間緊湊，適合低吠叫、運動量適中或偏靜態的毛孩", "icon": "🏢"},
    {"id": "電梯大樓 (中等空間)", "name": "電梯大樓 (中等空間)", "desc": "中型生活空間，社區環境好，適合適應力強、友善親人的毛孩", "icon": "🏙️"},
    {"id": "透天厝/有庭院", "name": "透天厝 / 獨立住宅 (有庭院)", "desc": "空間充裕有戶外庭院，適合活潑好動、喜愛探索跑跳的毛孩", "icon": "🏡"},
    {"id": "郊區/寬闊空間", "name": "郊區 / 鄉村 (寬闊大空間)", "desc": "擁有廣大草坪與戶外環境，能容納大型犬奔馳釋放天性", "icon": "🌳"}
]

COUNTRY_OPTIONS = [
    {"id": "台灣", "name": "台灣 (海島亞熱帶)", "desc": "氣候溫暖潮濕多雨，重視皮毛防潮透氣、防跳蚤壁蝨與定期排廢毛", "icon": "🇹🇼"},
    {"id": "日本/韓國", "name": "日本 / 韓國 (四季分明)", "desc": "秋冬乾冷且換季溫差大，重視換毛季深層梳理與皮毛保濕防靜電", "icon": "🇯🇵"},
    {"id": "歐美地區", "name": "歐美地區 (溫帶/寒帶)", "desc": "空間廣闊、氣候乾爽或冬季寒冷，重視雙層毛保養與戶外防護", "icon": "🌍"},
    {"id": "東南亞", "name": "東南亞 (熱帶氣候)", "desc": "全年高溫炎熱，需加強腳底與腹部散熱修剪，注重洗浴後徹底吹乾", "icon": "☀️"},
    {"id": "其他地區", "name": "其他國家 / 地區", "desc": "依據居家空調環境與在地氣候，提供最彈性貼心的專業照護建議", "icon": "🌐"}
]

ZODIAC_PROFILES = [
    {"name": "牡羊座", "code": "Aries", "icon": "♈", "dates": "3/21 - 4/19", "element": "火象", "trait": "熱情坦率、勇敢敏捷", 
     "stars": [{"x": 100, "y": 120}, {"x": 220, "y": 80}, {"x": 320, "y": 140}, {"x": 380, "y": 220}],
     "lines": [[0,1], [1,2], [2,3]]},
    {"name": "金牛座", "code": "Taurus", "icon": "♉", "dates": "4/20 - 5/20", "element": "土象", "trait": "沉穩踏實、溫柔耐心",
     "stars": [{"x": 80, "y": 200}, {"x": 160, "y": 160}, {"x": 240, "y": 140}, {"x": 320, "y": 80}, {"x": 360, "y": 170}, {"x": 280, "y": 230}],
     "lines": [[0,1], [1,2], [2,3], [2,4], [4,5], [5,1]]},
    {"name": "雙子座", "code": "Gemini", "icon": "♊", "dates": "5/21 - 6/20", "element": "風象", "trait": "機智好奇、靈動多變",
     "stars": [{"x": 100, "y": 60}, {"x": 120, "y": 180}, {"x": 130, "y": 280}, {"x": 260, "y": 70}, {"x": 270, "y": 190}, {"x": 280, "y": 290}],
     "lines": [[0,1], [1,2], [3,4], [4,5], [0,3], [1,4]]},
    {"name": "巨蟹座", "code": "Cancer", "icon": "♋", "dates": "6/21 - 7/22", "element": "水象", "trait": "溫柔顧家、情感深厚",
     "stars": [{"x": 200, "y": 80}, {"x": 200, "y": 170}, {"x": 120, "y": 260}, {"x": 280, "y": 260}, {"x": 200, "y": 270}],
     "lines": [[0,1], [1,2], [1,3], [1,4]]},
    {"name": "獅子座", "code": "Leo", "icon": "♌", "dates": "7/23 - 8/22", "element": "火象", "trait": "自信大方、陽光霸氣",
     "stars": [{"x": 80, "y": 220}, {"x": 180, "y": 230}, {"x": 240, "y": 150}, {"x": 320, "y": 140}, {"x": 360, "y": 70}, {"x": 300, "y": 50}, {"x": 240, "y": 90}],
     "lines": [[0,1], [1,2], [2,3], [3,4], [4,5], [5,6], [6,2]]},
    {"name": "處女座", "code": "Virgo", "icon": "♍", "dates": "8/23 - 9/22", "element": "土象", "trait": "細心敏銳、追求完美",
     "stars": [{"x": 80, "y": 90}, {"x": 160, "y": 140}, {"x": 240, "y": 180}, {"x": 280, "y": 260}, {"x": 340, "y": 190}, {"x": 380, "y": 100}],
     "lines": [[0,1], [1,2], [2,3], [3,4], [4,5], [2,4]]},
    {"name": "天秤座", "code": "Libra", "icon": "♎", "dates": "9/23 - 10/22", "element": "風象", "trait": "優雅和諧、愛好美麗",
     "stars": [{"x": 100, "y": 180}, {"x": 200, "y": 80}, {"x": 300, "y": 180}, {"x": 140, "y": 260}, {"x": 260, "y": 260}],
     "lines": [[0,1], [1,2], [0,3], [2,4], [3,4]]},
    {"name": "天蠍座", "code": "Scorpio", "icon": "♏", "dates": "10/23 - 11/21", "element": "水象", "trait": "深刻專一、洞察力強",
     "stars": [{"x": 80, "y": 90}, {"x": 140, "y": 110}, {"x": 200, "y": 150}, {"x": 240, "y": 210}, {"x": 290, "y": 250}, {"x": 350, "y": 220}, {"x": 370, "y": 160}],
     "lines": [[0,1], [1,2], [2,3], [3,4], [4,5], [5,6]]},
    {"name": "射手座", "code": "Sagittarius", "icon": "♐", "dates": "11/22 - 12/21", "element": "火象", "trait": "崇尚自由、樂天開朗",
     "stars": [{"x": 80, "y": 180}, {"x": 160, "y": 160}, {"x": 230, "y": 150}, {"x": 300, "y": 100}, {"x": 350, "y": 160}, {"x": 260, "y": 240}],
     "lines": [[0,1], [1,2], [2,3], [3,4], [2,5], [4,5]]},
    {"name": "魔羯座", "code": "Capricorn", "icon": "♑", "dates": "12/22 - 1/19", "element": "土象", "trait": "沉著自律、堅韌可靠",
     "stars": [{"x": 80, "y": 100}, {"x": 160, "y": 140}, {"x": 260, "y": 160}, {"x": 340, "y": 120}, {"x": 300, "y": 230}, {"x": 190, "y": 220}],
     "lines": [[0,1], [1,2], [2,3], [3,4], [4,5], [5,1]]},
    {"name": "水瓶座", "code": "Aquarius", "icon": "♒", "dates": "1/20 - 2/18", "element": "風象", "trait": "獨特前衛、博愛創新",
     "stars": [{"x": 80, "y": 120}, {"x": 140, "y": 90}, {"x": 200, "y": 130}, {"x": 260, "y": 90}, {"x": 320, "y": 140}, {"x": 360, "y": 220}],
     "lines": [[0,1], [1,2], [2,3], [3,4], [4,5]]},
    {"name": "雙魚座", "code": "Pisces", "icon": "♓", "dates": "2/19 - 3/20", "element": "水象", "trait": "浪漫溫柔、同理心高",
     "stars": [{"x": 80, "y": 100}, {"x": 130, "y": 160}, {"x": 210, "y": 230}, {"x": 280, "y": 210}, {"x": 330, "y": 140}, {"x": 360, "y": 80}],
     "lines": [[0,1], [1,2], [2,3], [3,4], [4,5]]}
]

def get_country_advice(country_name):
    if "台灣" in country_name:
        return "🇹🇼 【台灣海島氣候照護重點】：台灣氣候長年潮濕悶熱，毛孩容易有皮脂分泌過盛、耳道潮濕發炎與體外寄生蟲困擾。沐曦特別推薦定期施作「除蚤藥浴」與「草本泥浴」，有效淨化毛囊、舒緩換季皮膚搔癢！"
    elif "日本" in country_name or "韓國" in country_name:
        return "🇯🇵 【四季分明氣候照護重點】：換季時溫差與掉毛量明顯，秋冬易毛躁乾燥。推薦使用沐曦「深層護髮SPA」鎖水滋潤皮毛，並加強換季排梳！"
    elif "歐美" in country_name:
        return "🌍 【溫帶/寒帶氣候照護重點】：戶外草地奔馳頻繁且冬季寒冷，建議毛髮維持適度自然長度以利保暖，返家後定期梳洗肉球與腳底毛！"
    elif "東南亞" in country_name:
        return "☀️ 【熱帶氣候照護重點】：全年高溫需加強局部散熱修剪（肚肚毛、腳底毛），洗澡後務必徹底吹整到底層，避免皮膚濕疹！"
    else:
        return "🌐 【在地氣候照護重點】：維持室內良好溫濕度平衡，定期梳理底層廢毛以確保皮膚最佳透氣度與光澤！"

def get_zodiac_advice(zodiac_name):
    element_map = {
        "牡羊座": ("火象", "♈ 牡羊座充滿無窮活力與開拓精神，與活潑聰穎、反應機敏的毛孩最能激發彼此的快樂共鳴！"),
        "金牛座": ("土象", "♉ 金牛座講求舒適與高品質生活，與沉穩安靜、享受被撫摸梳毛的毛孩是天生默契組合！"),
        "雙子座": ("風象", "♊ 雙子座好奇心旺盛且多才多藝，與鬼靈精怪、愛學新把戲的毛孩相處絕無冷場！"),
        "巨蟹座": ("水象", "♋ 巨蟹座情感細膩且極為顧家，與溫柔依賴、渴望深情陪伴的毛孩心靈相通！"),
        "獅子座": ("火象", "♌ 獅子座自帶王者風範與慷慨熱情，適合氣質出眾、外型亮麗且忠誠自信的命定毛孩！"),
        "處女座": ("土象", "♍ 處女座細心敏銳注重生活品質，與自律愛乾淨、習慣規律作息的毛孩生活最合拍！"),
        "天秤座": ("風象", "♎ 天秤座天生追求優雅美感與和平氛圍，與長相精緻甜美、舉止高雅的毛孩是街頭最美風景！"),
        "天蠍座": ("水象", "♏ 天蠍座專一深情且洞察力強，一旦認定彼此便是生死相隨的靈魂守護者！"),
        "射手座": ("火象", "♐ 射手座熱愛大自然與自由冒險，適合熱愛戶外奔馳、樂觀開朗的陽光夥伴！"),
        "魔羯座": ("土象", "♑ 魔羯座沉穩堅毅有責任感，與忠心耿耿、服從規律的毛孩建立起最堅實的信任紐帶！"),
        "水瓶座": ("風象", "♒ 水瓶座獨具風格且尊重個體自由，與個性獨立有主見、不隨波逐流的酷毛孩最惺惺相惜！"),
        "雙魚座": ("水象", "♓ 雙魚座浪漫多情富同理心，與極具靈性、能敏銳感知主人喜怒哀樂的貼心毛孩心心相印！")
    }
    return element_map.get(zodiac_name, ("星象守護", "✨ 星座星光注入靈魂默契，讓您與毛孩的相遇成為命中注定的美好篇章！"))

@app.route("/api/mbti/options", methods=["GET"])
def get_mbti_options():
    """取得 MBTI 分類資料、居住環境選單、國家選單與 12 星座配置"""
    return jsonify({
        "success": True,
        "mbti_profiles": MBTI_PROFILES,
        "residence_options": RESIDENCE_OPTIONS,
        "country_options": COUNTRY_OPTIONS,
        "zodiac_profiles": ZODIAC_PROFILES
    })

@app.route("/api/mbti/match", methods=["POST"])
def match_pet():
    """依據 MBTI、居住環境、國家與星座/生日查詢 MySQL 資料庫並回傳推薦毛孩"""
    data = request.get_json() or {}
    mbti = data.get("mbti", "").strip().upper()
    residence = data.get("residence", "").strip()
    country = data.get("country", "").strip() or "台灣"
    birthday = data.get("birthday", "").strip()
    zodiac = data.get("zodiac", "").strip() or "獅子座"

    if not mbti or not residence:
        return jsonify({"success": False, "error": "請選擇 MBTI 與居住環境！"}), 400

    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # 1. 優先精準查詢 MBTI + Residence
            cur.execute("""
                SELECT * FROM pet_matches 
                WHERE mbti = %s AND residence = %s
                LIMIT 1;
            """, (mbti, residence))
            match_row = cur.fetchone()

            # 2. 若無完全相符，依 MBTI 查詢
            if not match_row:
                cur.execute("""
                    SELECT * FROM pet_matches 
                    WHERE mbti = %s
                    LIMIT 1;
                """, (mbti,))
                match_row = cur.fetchone()

            # 3. 若仍無（容錯備援），取全表最高評分
            if not match_row:
                cur.execute("SELECT * FROM pet_matches ORDER BY match_score DESC LIMIT 1;")
                match_row = cur.fetchone()

            # 4. 取得其他 2 隻備選推薦毛孩
            try:
                cur.execute("""
                    SELECT * FROM pet_matches 
                    WHERE id != %s 
                    ORDER BY RANDOM() 
                    LIMIT 2;
                """, (match_row["id"],))
                alt_rows = cur.fetchall()
            except Exception:
                try:
                    cur.execute("""
                        SELECT * FROM pet_matches 
                        WHERE id != %s 
                        ORDER BY RAND() 
                        LIMIT 2;
                    """, (match_row["id"],))
                    alt_rows = cur.fetchall()
                except Exception:
                    cur.execute("""
                        SELECT * FROM pet_matches 
                        WHERE id != %s 
                        LIMIT 2;
                    """, (match_row["id"],))
                    alt_rows = cur.fetchall()

        conn.close()

        country_advice = get_country_advice(country)
        zodiac_element, zodiac_advice = get_zodiac_advice(zodiac)

        return jsonify({
            "success": True,
            "query": {
                "mbti": mbti,
                "residence": residence,
                "country": country,
                "birthday": birthday,
                "zodiac": zodiac,
                "zodiac_element": zodiac_element
            },
            "match": match_row,
            "country_advice": country_advice,
            "zodiac_advice": zodiac_advice,
            "alternatives": alt_rows
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/mbti/send-backup", methods=["POST"])
def send_match_backup():
    """將毛孩速配測驗結果儲存至 MySQL 並寄送備份郵件至顧客信箱"""
    data = request.get_json() or {}
    email = data.get("email", "").strip()
    owner_name = data.get("owner_name", "").strip() or "親愛的毛孩家長"
    mbti = data.get("mbti", "").strip()
    residence = data.get("residence", "").strip()
    country = data.get("country", "").strip() or "台灣"
    birthday = data.get("birthday", "").strip()
    zodiac = data.get("zodiac", "").strip()
    match_data = data.get("match_data", {})

    if not email:
        return jsonify({"success": False, "error": "請輸入電子信箱！"}), 400

    # 簡單驗證 Email 格式
    import re
    if not re.match(r"^[^@]+@[^@]+\.[^@]+$", email):
        return jsonify({"success": False, "error": "請輸入有效的電子信箱格式！"}), 400

    breed_name = match_data.get("breed_name", "命定毛孩")
    pet_type = match_data.get("pet_type", "寵物")
    title = match_data.get("title", "天生一對的靈魂伴侶")
    match_score = int(match_data.get("match_score", 95))
    match_reason = match_data.get("match_reason", "")
    care_tips = match_data.get("care_tips", "")

    try:
        # 1. 寫入 saved_matches 資料表 (防禦性確保資料表存在)
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS `saved_matches` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `email` VARCHAR(150) NOT NULL,
                    `owner_name` VARCHAR(100) DEFAULT '親愛的毛孩家長',
                    `mbti` VARCHAR(10) NOT NULL,
                    `residence` VARCHAR(50) NOT NULL,
                    `country` VARCHAR(50) NOT NULL,
                    `birthday` VARCHAR(20) DEFAULT '',
                    `zodiac` VARCHAR(30) DEFAULT '',
                    `breed_name` VARCHAR(100) NOT NULL,
                    `pet_type` VARCHAR(50) NOT NULL,
                    `title` VARCHAR(150) NOT NULL,
                    `match_score` INT NOT NULL,
                    `match_reason` TEXT NOT NULL,
                    `care_tips` TEXT NOT NULL,
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX `idx_email` (`email`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)
            cur.execute("""
                INSERT INTO saved_matches (
                    email, owner_name, mbti, residence, country, birthday, zodiac,
                    breed_name, pet_type, title, match_score, match_reason, care_tips
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
            """, (
                email, owner_name, mbti, residence, country, birthday, zodiac,
                breed_name, pet_type, title, match_score, match_reason, care_tips
            ))
        conn.close()

        # 發送測驗結果報告信件 (若有設定 SMTP 則自動寄發真實信件)
        try:
            match_email_html = f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #FFE4D6; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                <div style="background: linear-gradient(135deg, #1E1B4B, #4338CA); color: #FFF; padding: 24px; text-align: center;">
                    <h2 style="margin: 0; font-size: 22px;">✨ 沐曦 MuXi 毛孩速配靈魂測驗報告</h2>
                    <p style="margin: 6px 0 0 0; font-size: 14px; opacity: 0.85;">MBTI × 星座 × 居住空間 專屬命定推薦</p>
                </div>
                <div style="padding: 24px; color: #333; line-height: 1.6;">
                    <p>親愛的 <b>{owner_name}</b> 您好：</p>
                    <p>星光指引了您與命定毛孩的相遇！以下為您的專屬媒合報告：</p>
                    
                    <div style="background: #F5F3FF; border-radius: 10px; padding: 18px; text-align: center; margin: 15px 0;">
                        <h3 style="margin: 0; color: #4338CA; font-size: 22px;">🐾 命定毛孩：{breed_name}</h3>
                        <p style="margin: 5px 0 0 0; color: #6D28D9; font-weight: bold;">靈魂契合度：{match_score}% · {title}</p>
                    </div>

                    <p><b>🧩 測驗條件：</b> MBTI: {mbti} ｜ 星座: {zodiac} ｜ 空間: {residence} ｜ 地區: {country}</p>
                    <p><b>💖 契合原因：</b><br>{match_reason}</p>
                    <p><b>🌿 照護與洗護指南：</b><br>{care_tips}</p>

                    <div style="text-align: center; margin-top: 25px;">
                        <a href="https://muxi-pet.onrender.com/booking.html" style="background: #FE7000; color: #FFF; padding: 10px 24px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block;">立即為毛孩預約頂級洗護</a>
                    </div>
                    <p style="text-align: center; margin-top: 25px; font-size: 12px; color: #999;">沐曦 MuXi 寵物生活館 · 讓愛與陪伴更美好</p>
                </div>
            </div>
            """
            send_smtp_email(email, f"✨【沐曦 MuXi】您的命定毛孩速配報告：{breed_name} (契合度 {match_score}%)", match_email_html)
        except Exception:
            pass

        return jsonify({
            "success": True,
            "message": f"測驗結果報告已成功備份並寄送至 {email}！",
            "saved_data": {
                "email": email,
                "owner_name": owner_name,
                "mbti": mbti,
                "zodiac": zodiac,
                "country": country,
                "breed_name": breed_name,
                "match_score": match_score
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/matches/saved", methods=["GET"])
@app.route("/api/saved-matches", methods=["GET"])
def list_saved_matches():
    """查詢所有顧客保存的速配測驗報告 (供員工後台管理使用)"""
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, email, owner_name, mbti, residence, country, birthday, zodiac,
                       breed_name, pet_type, title, match_score, match_reason, care_tips, created_at
                FROM saved_matches
                ORDER BY created_at DESC;
            """)
            rows = cur.fetchall()
        conn.close()

        for r in rows:
            if isinstance(r.get("created_at"), (datetime.date, datetime.datetime)):
                r["created_at"] = r["created_at"].strftime("%Y-%m-%d %H:%M:%S")

        return jsonify({"success": True, "saved_matches": rows, "count": len(rows)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# 模組載入時自動初始化資料庫 (確保在 Gunicorn / Render 雲端環境啟動時自動建立全部資料表與種子資料)
try:
    init_db()
except Exception as e:
    print(f"[Init DB Notice] {e}")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)



