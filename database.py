import sqlite3
import pymysql
import pymysql.cursors
import os, re
from config import Config

USE_SQLITE = False

class SQLiteCursorWrapper:
    def __init__(self, cursor, conn):
        self._cur = cursor
        self._conn = conn

    def execute(self, sql, params=None):
        converted_sql = sql
        converted_sql = re.sub(r'(?<!%)(%s)', '?', converted_sql)
        converted_sql = re.sub(r'\s+FOR\s+UPDATE\s*;?', ';', converted_sql, flags=re.IGNORECASE)
        converted_sql = re.sub(r'ENGINE=InnoDB', '', converted_sql, flags=re.IGNORECASE)
        converted_sql = re.sub(r'DEFAULT\s+CHARSET=\w+', '', converted_sql, flags=re.IGNORECASE)
        converted_sql = re.sub(r'RAND\(\)', 'RANDOM()', converted_sql, flags=re.IGNORECASE)
        converted_sql = re.sub(r'COLLATE=\w+', '', converted_sql, flags=re.IGNORECASE)
        converted_sql = re.sub(r'AFTER\s+`?\w+`?', '', converted_sql, flags=re.IGNORECASE)
        converted_sql = re.sub(r'INT\s+AUTO_INCREMENT\s+PRIMARY\s+KEY', 'INTEGER PRIMARY KEY AUTOINCREMENT', converted_sql, flags=re.IGNORECASE)
        converted_sql = re.sub(r'AUTO_INCREMENT', 'AUTOINCREMENT', converted_sql, flags=re.IGNORECASE)
        converted_sql = re.sub(r'ENUM\([^)]+\)', 'TEXT', converted_sql, flags=re.IGNORECASE)
        converted_sql = re.sub(r'TIMESTAMP\s+DEFAULT\s+CURRENT_TIMESTAMP', 'DATETIME DEFAULT CURRENT_TIMESTAMP', converted_sql, flags=re.IGNORECASE)
        converted_sql = re.sub(r'INDEX\s+`?[a-zA-Z0-9_]+`?\s*\([^)]+\),?', '', converted_sql, flags=re.IGNORECASE)
        converted_sql = re.sub(r'UNIQUE\s+KEY\s+`?[a-zA-Z0-9_]+`?\s*\(([^)]+)\)', r'UNIQUE(\1)', converted_sql, flags=re.IGNORECASE)
        converted_sql = re.sub(r',\s*\)', ')', converted_sql)

        # Handle SHOW COLUMNS in SQLite
        if 'SHOW COLUMNS FROM' in sql.upper():
            match = re.search(r"SHOW\s+COLUMNS\s+FROM\s+`?(\w+)`?\s+LIKE\s+'(\w+)';?", sql, re.IGNORECASE)
            if match:
                tbl, col = match.groups()
                try:
                    self._cur.execute(f"PRAGMA table_info({tbl});")
                    cols = [r['name'] if isinstance(r, dict) else r[1] for r in self._cur.fetchall()]
                    if col in cols:
                        self._cur.execute("SELECT 1 as Field;")
                    else:
                        self._cur.execute("SELECT 1 WHERE 1=0;")
                except Exception:
                    self._cur.execute("SELECT 1 WHERE 1=0;")
                return self

        try:
            if params:
                self._cur.execute(converted_sql, params)
            else:
                self._cur.execute(converted_sql)
            self._conn.commit()
        except sqlite3.OperationalError as e:
            if 'duplicate column' in str(e).lower() or 'already exists' in str(e).lower():
                pass
            else:
                raise e
        return self

    def executemany(self, sql, param_list):
        converted_sql = re.sub(r'(?<!%)(%s)', '?', sql)
        converted_sql = re.sub(r'ON\s+DUPLICATE\s+KEY\s+UPDATE.*', '', converted_sql, flags=re.IGNORECASE)
        if 'INSERT INTO `pricing_rules`' in converted_sql or 'INSERT INTO pricing_rules' in converted_sql:
            converted_sql = converted_sql.replace('INSERT INTO', 'INSERT OR REPLACE INTO')
        
        self._cur.executemany(converted_sql, param_list)
        self._conn.commit()
        return self

    def fetchone(self):
        row = self._cur.fetchone()
        if row is None:
            return None
        return dict(row)

    def fetchall(self):
        rows = self._cur.fetchall()
        return [dict(r) for r in rows]

    @property
    def rowcount(self):
        return self._cur.rowcount

    @property
    def lastrowid(self):
        return self._cur.lastrowid

    @property
    def description(self):
        return self._cur.description

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        pass

class SQLiteConnectionWrapper:
    def __init__(self, db_path='muxi.db'):
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row

    def cursor(self):
        return SQLiteCursorWrapper(self._conn.cursor(), self._conn)

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()

def check_use_sqlite():
    global USE_SQLITE
    if USE_SQLITE:
        return True
    try:
        conn = pymysql.connect(
            host=Config.DB_HOST,
            port=Config.DB_PORT,
            user=Config.DB_USER,
            password=Config.DB_PASSWORD,
            charset='utf8mb4',
            connect_timeout=2
        )
        conn.close()
        USE_SQLITE = False
        return False
    except Exception as e:
        USE_SQLITE = True
        print(f"[DB] MySQL 連線不可用 ({e})，自動切換至內建 SQLite (muxi.db) 資料庫，確保雲端 Render 100% 穩定運作！")
        return True

def get_server_connection():
    """連線到 MySQL 伺服器 (不指定資料庫)"""
    if USE_SQLITE or check_use_sqlite():
        return SQLiteConnectionWrapper('muxi.db')
    return pymysql.connect(
        host=Config.DB_HOST,
        port=Config.DB_PORT,
        user=Config.DB_USER,
        password=Config.DB_PASSWORD,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True
    )

def get_db_connection():
    """連線到資料庫 (自動偵測 MySQL 或 SQLite)"""
    if USE_SQLITE or check_use_sqlite():
        return SQLiteConnectionWrapper('muxi.db')
    try:
        return pymysql.connect(
            host=Config.DB_HOST,
            port=Config.DB_PORT,
            user=Config.DB_USER,
            password=Config.DB_PASSWORD,
            database=Config.DB_NAME,
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor,
            autocommit=True
        )
    except Exception:
        return SQLiteConnectionWrapper('muxi.db')

def init_db():
    """自動初始化資料庫與資料表，並寫入種子資料 (支援 MySQL 與 SQLite 雙模式)"""
    # 1. 建立 MySQL 資料庫 (若為 MySQL 模式)
    if not (USE_SQLITE or check_use_sqlite()):
        try:
            server_conn = get_server_connection()
            with server_conn.cursor() as cur:
                cur.execute(f"CREATE DATABASE IF NOT EXISTS `{Config.DB_NAME}` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
            server_conn.close()
        except Exception:
            pass

    # 2. 建立資料表
    conn = get_db_connection()
    with conn.cursor() as cur:
        # 員工表 (employees) - 後台登入驗證
        cur.execute("""
            CREATE TABLE IF NOT EXISTS `employees` (
                `emp_no` VARCHAR(50) PRIMARY KEY,
                `name` VARCHAR(100) NOT NULL,
                `password` VARCHAR(100) NOT NULL,
                `role` VARCHAR(50) NOT NULL DEFAULT '員工',
                `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)

        # 會員表 (members)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS `members` (
                `member_id` VARCHAR(50) PRIMARY KEY,
                `name` VARCHAR(100) NOT NULL,
                `phone` VARCHAR(30) NOT NULL,
                `email` VARCHAR(150),
                `password` VARCHAR(100) NOT NULL DEFAULT '123456',
                `member_type` ENUM('一般會員', '黃金會員') NOT NULL DEFAULT '一般會員',
                `discount_rate` DECIMAL(4,2) NOT NULL DEFAULT 0.90,
                `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX `idx_member_phone` (`phone`),
                INDEX `idx_member_email` (`email`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)

        # 商城購物訂單表 (orders)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS `orders` (
                `id` INT AUTO_INCREMENT PRIMARY KEY,
                `order_no` VARCHAR(50) NOT NULL UNIQUE,
                `customer_name` VARCHAR(100) NOT NULL,
                `customer_phone` VARCHAR(30) NOT NULL,
                `customer_email` VARCHAR(150) NOT NULL,
                `member_id` VARCHAR(50) DEFAULT NULL,
                `member_type` VARCHAR(50) DEFAULT '一般訪客',
                `original_amount` INT NOT NULL DEFAULT 0,
                `discount_amount` INT NOT NULL DEFAULT 0,
                `total_amount` INT NOT NULL DEFAULT 0,
                `pickup_method` VARCHAR(100) DEFAULT '門市自取',
                `payment_status` VARCHAR(100) DEFAULT '到店付款 (暫不接受線上付款)',
                `status` ENUM('pending_pickup', 'completed', 'cancelled') NOT NULL DEFAULT 'pending_pickup',
                `notes` TEXT,
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX `idx_order_phone` (`customer_phone`),
                INDEX `idx_order_email` (`customer_email`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)

        # 商城購物訂單明細表 (order_items)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS `order_items` (
                `id` INT AUTO_INCREMENT PRIMARY KEY,
                `order_no` VARCHAR(50) NOT NULL,
                `product_name` VARCHAR(150) NOT NULL,
                `spec` VARCHAR(100) DEFAULT '標準',
                `unit_price` INT NOT NULL DEFAULT 0,
                `quantity` INT NOT NULL DEFAULT 1,
                `subtotal` INT NOT NULL DEFAULT 0,
                `image_url` VARCHAR(255) DEFAULT '',
                INDEX `idx_item_order_no` (`order_no`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)

        # 價目表 (pricing_rules)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS `pricing_rules` (
                `id` INT AUTO_INCREMENT PRIMARY KEY,
                `pet_type` VARCHAR(100) NOT NULL,
                `service_type` VARCHAR(100) NOT NULL,
                `base_price` INT NOT NULL,
                `duration_hours` INT NOT NULL DEFAULT 1,
                UNIQUE KEY `uk_pet_service` (`pet_type`, `service_type`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)

        # 加購項目表 (addons)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS `addons` (
                `id` INT AUTO_INCREMENT PRIMARY KEY,
                `name` VARCHAR(100) NOT NULL UNIQUE,
                `price` INT NOT NULL DEFAULT 0,
                `description` VARCHAR(255)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)

        # 預約紀錄表 (bookings)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS `bookings` (
                `id` INT AUTO_INCREMENT PRIMARY KEY,
                `booking_id` VARCHAR(50) NOT NULL UNIQUE,
                `booking_date` DATE NOT NULL,
                `time_slot` VARCHAR(20) NOT NULL,
                `owner_name` VARCHAR(100) NOT NULL,
                `owner_phone` VARCHAR(30) NOT NULL,
                `owner_email` VARCHAR(150) NOT NULL,
                `pet_name` VARCHAR(100) DEFAULT '未命名',
                `pet_type` VARCHAR(100) NOT NULL,
                `service_type` VARCHAR(100) NOT NULL,
                `addon_type` VARCHAR(100) DEFAULT '無',
                `member_type` VARCHAR(50) DEFAULT '無',
                `member_id` VARCHAR(50) DEFAULT NULL,
                `base_price` INT NOT NULL DEFAULT 0,
                `addon_price` INT NOT NULL DEFAULT 0,
                `discount_amount` INT NOT NULL DEFAULT 0,
                `total_price` INT NOT NULL DEFAULT 0,
                `estimated_duration` INT NOT NULL DEFAULT 1,
                `status` ENUM('confirmed', 'completed', 'cancelled') NOT NULL DEFAULT 'confirmed',
                `notes` TEXT,
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX `idx_date_time` (`booking_date`, `time_slot`),
                INDEX `idx_phone` (`owner_phone`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)

        # MBTI 與居住環境毛孩速配推薦表 (pet_matches)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS `pet_matches` (
                `id` INT AUTO_INCREMENT PRIMARY KEY,
                `mbti` VARCHAR(10) NOT NULL,
                `residence` VARCHAR(50) NOT NULL,
                `pet_type` VARCHAR(50) NOT NULL,
                `breed_name` VARCHAR(100) NOT NULL,
                `title` VARCHAR(150) NOT NULL,
                `personality_traits` VARCHAR(255) NOT NULL,
                `match_reason` TEXT NOT NULL,
                `care_tips` TEXT NOT NULL,
                `recommended_service` VARCHAR(100) NOT NULL,
                `match_score` INT NOT NULL DEFAULT 95,
                `image_icon` VARCHAR(50) DEFAULT '🐾',
                INDEX `idx_mbti_residence` (`mbti`, `residence`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)

        # 測驗保留結果與信箱備份紀錄表 (saved_matches)
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

        # 確保 bookings 表格包含 stay_service 與 stay_nights 欄位
        cur.execute("SHOW COLUMNS FROM `bookings` LIKE 'stay_service';")
        if not cur.fetchone():
            cur.execute("ALTER TABLE `bookings` ADD COLUMN `stay_service` VARCHAR(100) DEFAULT '無' AFTER `service_type`;")
            cur.execute("ALTER TABLE `bookings` ADD COLUMN `stay_nights` INT NOT NULL DEFAULT 0 AFTER `stay_service`;")

        # 確保現有表格包含 birthday 與 zodiac 欄位 (若已存在表格)
        cur.execute("SHOW COLUMNS FROM `saved_matches` LIKE 'zodiac';")
        if not cur.fetchone():
            cur.execute("ALTER TABLE `saved_matches` ADD COLUMN `birthday` VARCHAR(20) DEFAULT '' AFTER `country`;")
            cur.execute("ALTER TABLE `saved_matches` ADD COLUMN `zodiac` VARCHAR(30) DEFAULT '' AFTER `birthday`;")

        # 確保 members 表格包含 password 欄位
        cur.execute("SHOW COLUMNS FROM `members` LIKE 'password';")
        if not cur.fetchone():
            cur.execute("ALTER TABLE `members` ADD COLUMN `password` VARCHAR(100) NOT NULL DEFAULT '123456' AFTER `email`;")

        # 3. 寫入種子員工資料 (若無資料)
        cur.execute("SELECT COUNT(*) as count FROM `employees`;")
        if cur.fetchone()["count"] == 0:
            employees_seed = [
                ("EMP001", "沐曦店長", "admin123", "店長"),
                ("EMP002", "沐曦店員-小美", "admin123", "店員"),
                ("MUXI888", "資深美容師-阿翔", "muxi2026", "美容師")
            ]
            cur.executemany("""
                INSERT INTO `employees` (`emp_no`, `name`, `password`, `role`)
                VALUES (%s, %s, %s, %s);
            """, employees_seed)

        # 4. 寫入種子會員資料 (若無資料)
        cur.execute("SELECT COUNT(*) as count FROM `members`;")
        if cur.fetchone()["count"] == 0:
            members_seed = [
                ("VIP001", "王小明", "0912345678", "ming@example.com", "123456", "一般會員", 0.90),
                ("GOLD888", "林大寶", "0987654321", "dabao@example.com", "123456", "黃金會員", 0.85),
                ("VIP999", "陳美美", "0922333444", "meimei@example.com", "123456", "一般會員", 0.90),
                ("GOLD777", "張雅婷", "0933555777", "yating@example.com", "123456", "黃金會員", 0.85)
            ]
            cur.executemany("""
                INSERT INTO `members` (`member_id`, `name`, `phone`, `email`, `password`, `member_type`, `discount_rate`)
                VALUES (%s, %s, %s, %s, %s, %s, %s);
            """, members_seed)

        # 4. 寫入價目表種子 (與 clean.html / clean2.html 100% 一致)
        pricing_seed = [
            ("小型犬", "純清潔", 350, 1),
            ("小型犬", "小美容", 500, 2),
            ("小型犬", "大美容", 900, 3),
            ("中型犬", "純清潔", 500, 1),
            ("中型犬", "小美容", 700, 2),
            ("中型犬", "大美容", 1300, 3),
            ("大型犬", "純清潔", 1000, 1),
            ("大型犬", "小美容", 1400, 2),
            ("大型犬", "大美容", 2200, 3),
            ("巨型犬", "純清潔", 1500, 1),
            ("巨型犬", "小美容", 2000, 2),
            ("巨型犬", "大美容", 2800, 3),
            ("短毛貓", "純清潔", 400, 1),
            ("短毛貓", "小美容", 600, 2),
            ("短毛貓", "大美容", 1000, 3),
            ("長毛貓", "純清潔", 600, 1),
            ("長毛貓", "小美容", 800, 2),
            ("長毛貓", "大美容", 1400, 3),
            ("大型長毛貓（布偶、緬因等）", "純清潔", 800, 1),
            ("大型長毛貓（布偶、緬因等）", "小美容", 1000, 2),
            ("大型長毛貓（布偶、緬因等）", "大美容", 1600, 3)
        ]
        cur.executemany("""
            INSERT INTO `pricing_rules` (`pet_type`, `service_type`, `base_price`, `duration_hours`)
            VALUES (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE `base_price` = VALUES(`base_price`), `duration_hours` = VALUES(`duration_hours`);
        """, pricing_seed)

        # 5. 寫入加購項目種子
        addons_seed = [
            ("無", 0, "使用本店嚴選溫和洗劑"),
            ("除蚤藥浴", 300, "有效驅除跳蚤、壁蝨，舒緩皮膚搔癢"),
            ("深層護髮SPA", 500, "日本原裝進口 Afloat Dog 系列"),
            ("草本浴", 400, "100% 天然有機草本配方"),
            ("碳酸泉浴", 400, "促進血液循環與皮毛新陳代謝")
        ]
        for name, price, desc in addons_seed:
            cur.execute("SELECT id FROM `addons` WHERE `name` = %s;", (name,))
            if cur.fetchone():
                cur.execute("UPDATE `addons` SET `price` = %s, `description` = %s WHERE `name` = %s;", (price, desc, name))
            else:
                cur.execute("INSERT INTO `addons` (`name`, `price`, `description`) VALUES (%s, %s, %s);", (name, price, desc))

        # 6. 寫入示範預約資料 (若預約表為空)
        cur.execute("SELECT COUNT(*) as count FROM `bookings`;")
        if cur.fetchone()["count"] == 0:
            sample_bookings = [
                ("PET-20260817-001", "2026-08-17", "10:00", "王小明", "0912345678", "ming@example.com", "波比", "小型犬", "大美容", "深層護髮SPA", "一般會員", "VIP001", 800, 500, 130, 1170, 3, "confirmed", "第一次來店美容"),
                ("PET-20260817-002", "2026-08-17", "14:00", "林大寶", "0987654321", "dabao@example.com", "咪咪", "短毛貓", "小美容", "除蚤藥浴", "黃金會員", "GOLD888", 1500, 300, 270, 1530, 2, "confirmed", "貓咪較膽小"),
                ("PET-20260818-001", "2026-08-18", "11:00", "陳美美", "0922333444", "meimei@example.com", "豆豆", "中型犬", "純清潔", "碳酸泉浴", "一般會員", "VIP999", 800, 400, 120, 1080, 1, "confirmed", "預約接送服務")
            ]
            cur.executemany("""
                INSERT INTO `bookings` (
                    `booking_id`, `booking_date`, `time_slot`, `owner_name`, `owner_phone`, `owner_email`,
                    `pet_name`, `pet_type`, `service_type`, `addon_type`, `member_type`, `member_id`,
                    `base_price`, `addon_price`, `discount_amount`, `total_price`, `estimated_duration`, `status`, `notes`
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
            """, sample_bookings)

        # 7. 寫入示範商城訂單資料 (若訂單表為空)
        cur.execute("SELECT COUNT(*) as count FROM `orders`;")
        if cur.fetchone()["count"] == 0:
            sample_orders = [
                ("ORD-20260822-001", "王小明", "0912345678", "ming@example.com", "VIP001", "一般會員", 1760, 176, 1584, "門市自取", "到店付款 (暫不接受線上付款)", "pending_pickup", "請協助備妥商品"),
                ("ORD-20260822-002", "林大寶", "0987654321", "dabao@example.com", "GOLD888", "黃金會員", 2280, 342, 1938, "門市自取", "到店付款 (暫不接受線上付款)", "completed", "已到店自取付款完成")
            ]
            cur.executemany("""
                INSERT INTO `orders` (
                    `order_no`, `customer_name`, `customer_phone`, `customer_email`, `member_id`, `member_type`,
                    `original_amount`, `discount_amount`, `total_amount`, `pickup_method`, `payment_status`, `status`, `notes`
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
            """, sample_orders)

            sample_items = [
                ("ORD-20260822-001", "法米納全齡犬-雞肉芒果", "1.5 kg", 880, 2, 1760, "DF7.jpg"),
                ("ORD-20260822-002", "瑪丁小型成犬雞肉", "5 kg", 2280, 1, 2280, "DF2.jpg")
            ]
            cur.executemany("""
                INSERT INTO `order_items` (`order_no`, `product_name`, `spec`, `unit_price`, `quantity`, `subtotal`, `image_url`)
                VALUES (%s, %s, %s, %s, %s, %s, %s);
            """, sample_items)

        # 7. 寫入 MBTI 與居住環境毛孩速配種子資料
        cur.execute("SELECT COUNT(*) as count FROM `pet_matches`;")
        if cur.fetchone()["count"] == 0:
            pet_matches_seeds = [
                # NF 外交家
                ("INFP", "公寓/套房 (無院子)", "短毛貓", "英國短毛貓", "治癒系安靜守護者", "溫柔沉靜、獨立不黏人、低噪不擾鄰", 
                 "INFP 內心細膩需要個人放鬆空間，英國短毛貓獨立安靜，不會過度索求關注，在公寓空間裡能給予彼此最適當的陪伴與心靈慰藉。", 
                 "英短日常需定期梳除廢毛以防毛球症，建議定期預約沐曦「純清潔」與「深層護髮SPA」，保持毛皮亮澤。", "純清潔 + 深層護髮SPA", 98, "🐱"),
                
                ("INFP", "透天厝/有庭院", "小型犬", "馬爾濟斯", "溫柔甜美的小精靈", "情感豐富、撒嬌黏人、無攻擊性", 
                 "INFP 富有同理心，馬爾濟斯溫柔細膩且熱愛陪伴主人，有庭院的空間非常適合牠們輕快漫步，能帶來無窮的溫暖治癒。", 
                 "馬爾濟斯白毛需注意淚腺與毛髮打結，建議定期施作沐曦「小美容」修剪眼周雜毛與腳底毛。", "小美容", 96, "🐶"),

                ("INFP", "電梯大樓 (中等空間)", "長毛貓", "布偶貓", "柔軟溫順的仙女貓", "極度親人、像玩偶般隨和、叫聲輕柔", 
                 "布偶貓的溫馴隨和完美契合 INFP 渴望被愛與和平的特質，在大樓環境中生活極度適應，隨時享受抱抱時光。", 
                 "長毛布偶貓毛質豐厚，推薦定期預約沐曦「大美容（精緻手剪）」與「草本浴」調養皮膚毛質。", "大美容 + 草本浴", 99, "🐱"),

                ("INFP", "郊區/寬闊空間", "中型犬", "喜樂蒂牧羊犬", "優雅敏銳的知心好友", "聰明靈敏、忠誠安靜、深情專一", 
                 "喜樂蒂敏銳細膩，能深刻感知 INFP 的情緒變化，在寬闊環境中能盡情奔跑釋放天性，是靈魂深處的忠實摯友。", 
                 "長雙層毛需注意換毛季排梳，推薦沐曦「深層潔淨」與「碳酸泉浴」活化毛囊。", "大美容 + 碳酸泉浴", 95, "🐶"),

                ("ENFP", "透天厝/有庭院", "中型犬", "柯基犬", "活力四射的快樂泉源", "熱情開朗、幽默頑皮、親和力滿分", 
                 "ENFP 充滿好奇心與活力，短腿大屁股的柯基總是元氣滿滿，有庭院可供奔跑探索，兩者相處每天都充滿歡笑與驚喜！", 
                 "柯基短毛但掉毛量大且易胖，建議定期來沐曦體驗「純清潔」排廢毛與「碳酸泉浴」舒緩關節肌肉。", "純清潔 + 碳酸泉浴", 99, "🐕"),

                ("ENFP", "公寓/套房 (無院子)", "小型犬", "玩具貴賓犬", "鬼靈精怪的百變萌寵", "智商極高、善解人意、不掉毛、活潑好動", 
                 "ENFP 熱愛社交與新奇事物，貴賓犬聰明且學習力強，適合公寓飼養且不掉毛，能隨時配合主人出門野餐或聚會！", 
                 "貴賓捲毛極易打結，強烈推薦定期施作沐曦「大美容」設計專屬造型（貴賓嘴、腳球造型）。", "大美容", 97, "🐩"),

                ("ENFP", "電梯大樓 (中等空間)", "短毛貓", "美國短毛貓", "探索世界的好奇寶寶", "活潑親人、適應力強、愛玩愛互動", 
                 "美短個性開朗熱情，喜愛與人互動玩逗貓棒，在大樓中能自主探索，與活力滿滿的 ENFP 是最棒的玩伴！", 
                 "美短活潑好動，定期清潔耳道與剪指甲可透過沐曦「純清潔」方案快速完成。", "純清潔", 94, "🐱"),

                ("ENFP", "郊區/寬闊空間", "大型犬", "黃金獵犬", "陽光暖心的大天使", "極度友善、熱愛大自然、熱情擁抱所有人", 
                 "ENFP 與黃金獵犬是天作之合！在郊區大空間中一起慢跑、丟球、露營，黃金獵犬的熱情能把生活填滿溫暖陽光。", 
                 "大型長毛犬洗澡吹整耗時，沐曦專業大型犬設備提供「大美容」及「深層護髮SPA」，讓毛髮蓬鬆飄逸！", "大美容 + 深層護髮SPA", 99, "🐕"),

                ("INFJ", "公寓/套房 (無院子)", "短毛貓", "俄羅斯藍貓", "神秘優雅的沉思者", "安靜害羞、忠誠專一、極度安靜", 
                 "INFJ 喜歡深度的靈魂共鳴與寧靜，俄羅斯藍貓低調安靜、動作優雅，只對最信任的主人敞開心房，是公寓中的寧靜伴侶。", 
                 "短密毛髮護理簡便，推薦沐曦「純清潔」溫和洗劑調理，維持銀藍色皮毛的光澤質感。", "純清潔", 98, "🐱"),

                ("INFJ", "透天厝/有庭院", "中型犬", "柴犬", "獨立有原則的守護犬", "沉穩獨立、忠心耿耿、愛乾淨、不亂叫", 
                 "INFJ 重視個人邊界與深層連結，柴犬具備貓一樣的獨立個性與犬類的忠誠，在庭院中怡然自得，與 INFJ 默契十足。", 
                 "柴犬換毛季毛量驚人，推薦沐曦「小美容」深層除廢毛與清潔耳道，讓愛乾淨的柴犬隨時清爽。", "小美容", 96, "🐕"),

                ("ENFJ", "電梯大樓 (中等空間)", "小型犬", "比熊犬", "人見人愛的小棉花糖", "樂觀友善、極愛撒嬌、社交達人", 
                 "ENFJ 喜歡照顧他人且極具號召力，比熊犬圓滾滾的棉花糖外型與樂天個性，能激發 ENFJ 的滿滿愛心，在大樓社區人見人誇！", 
                 "比熊需維持經典圓頭造型，推薦沐曦「大美容（精緻手剪）」搭配「深層護髮SPA」，維持雪白蓬鬆！", "大美容 + 深層護髮SPA", 98, "🐩"),

                # NT 分析家
                ("INTJ", "公寓/套房 (無院子)", "短毛貓", "英國短毛貓 (藍貓)", "獨立冷靜的智慧夥伴", "高度自主、有生活規律、安靜內斂", 
                 "INTJ 講求效率與條理，不喜無謂的打擾。英短生活規律、自律愛乾淨，公寓飼養省心不費力，彼此共享專注的寧靜生活。", 
                 "推薦沐曦定期「純清潔」與耳道潔淨，提供最有效率的專業洗護。", "純清潔", 97, "🐱"),

                ("INTJ", "透天厝/有庭院", "大型犬", "德國牧羊犬", "冷靜敏銳的戰略護衛", "極高服從度、聰明機警、忠心不二", 
                 "INTJ 欣賞聰明與執行力，德國牧羊犬具備頂級智商與工作能力，在透天庭院能施展守護本領，是能與 INTJ 達成默契的高智商夥伴。", 
                 "大型工作犬關節皮毛保養至關重要，建議施作沐曦「大美容」與「碳酸泉浴」維護肌肉關節健康。", "大美容 + 碳酸泉浴", 95, "🐕"),

                ("INTP", "公寓/套房 (無院子)", "短毛貓", "米克斯貓 (玳瑁/虎斑)", "奇思妙想的哲學家貓", "自得其樂、好奇心強、低維護成本", 
                 "INTP 沉浸於自己的思想世界，米克斯貓極度聰明且獨立，在公寓中能自得其樂探索世界，不會打擾 INTP 的思考節奏。", 
                 "定期基本梳洗剪指甲，交給沐曦「純清潔」輕鬆搞定！", "純清潔", 96, "🐱"),

                ("ENTJ", "透天厝/有庭院", "大型犬", "杜賓犬", "威嚴果斷的領導風範", "自信從容、紀律嚴明、高貴敏捷", 
                 "ENTJ 天生領導者氣場強大，杜賓犬身形矯健、忠心耿耿且服從性高，在寬敞庭院中展現王者風範，相得益彰！", 
                 "短毛但需注意皮脂分泌與毛孔健康，推薦沐曦「小美容」與「除蚤藥浴 / 草本浴」。", "小美容 + 草本浴", 97, "🐕"),

                ("ENTP", "電梯大樓 (中等空間)", "中型犬", "邊境牧羊犬", "機智滿分的高智商挑戰者", "反應極快、鬼點子多、學習力超群", 
                 "ENTP 熱愛智力挑戰與創新，邊牧智商犬界第一，兩者在一起就像智商對決，在大樓周邊散步能隨時互動訓練把戲！", 
                 "邊牧活動量大毛髮易髒，建議預約沐曦「大美容」進行深層清潔與廢毛梳整。", "大美容", 96, "🐕"),

                # SJ 守護者
                ("ISTJ", "公寓/套房 (無院子)", "小型犬", "迷你雪納瑞", "守規矩的忠實小老頭", "不掉毛、機警守規律、適應力極強", 
                 "ISTJ 重視責任感與生活規律，雪納瑞個性沉穩有原則，定時作息，不掉毛的特質非常適合有潔癖的公寓環境。", 
                 "雪納瑞招牌鬍鬚與眉毛造型，推薦沐曦「小美容」定期精準修剪保持帥氣！", "小美容", 98, "🐕"),

                ("ISTJ", "透天厝/有庭院", "中型犬", "柴犬", "一絲不苟的可靠守衛", "沉穩規律、自律愛潔、忠誠堅定", 
                 "ISTJ 欣賞原則與忠誠，柴犬生活規律且個性自律，在庭院中守望家園，是 ISTJ 值得信賴的踏實家庭成員。", 
                 "建議定期預約沐曦「純清潔」與「除蚤藥浴」，守護毛孩皮膚健康。", "純清潔 + 除蚤藥浴", 97, "🐕"),

                ("ISFJ", "電梯大樓 (中等空間)", "長毛貓", "布偶貓", "溫柔撫慰的家庭天使", "黏人貼心、極具母愛、性格溫和", 
                 "ISFJ 天生善於照顧他人且富有同情心，布偶貓渴望愛撫與陪伴，兩者相處就像溫暖的互相擁抱，為大樓家庭帶來滿滿幸福感。", 
                 "布偶貓絲滑長毛需細緻護理，推薦沐曦「大美容」與日本 Afloat「深層護髮SPA」。", "大美容 + 深層護髮SPA", 99, "🐱"),

                ("ISFJ", "透天厝/有庭院", "大型犬", "拉布拉多犬", "憨厚老實的守護天使", "溫柔耐心、忠心體貼、對家人極度友善", 
                 "ISFJ 體貼顧家，拉布拉多溫順友善、對小孩與長輩極有耐心，在庭院家庭中是最暖心的家庭一分子。", 
                 "拉布拉多雙層短毛需注意換毛與耳道，推薦沐曦「小美容」定期清潔耳道與洗浴。", "小美容", 98, "🐕"),

                ("ESTJ", "透天厝/有庭院", "大型犬", "德國牧羊犬", "紀律嚴明的家庭保衛者", "忠實果敢、服從命令、具責任感", 
                 "ESTJ 重視秩序與組織力，德牧的服從與高度責任感能完美配合 ESTJ 的家庭步調，在透天住宅發揮守護功能。", 
                 "推薦定期預約沐曦「大美容」進行皮毛保養與筋骨舒緩碳酸泉浴。", "大美容 + 碳酸泉浴", 98, "🐕"),

                ("ESFJ", "電梯大樓 (中等空間)", "小型犬", "博美犬", "熱情洋溢的社交小狐狸", "開朗活潑、討人喜歡、極具存在感", 
                 "ESFJ 喜歡熱鬧與照顧朋友，博美犬蓬鬆毛量與靈動雙眼隨時帶來滿滿歡樂，在大樓散步時是全場焦點！", 
                 "博美犬雙層毛需維持圓球立體感，推薦沐曦「大美容（精緻手剪）」呈現最完美的蓬鬆圓球造型！", "大美容", 97, "🐶"),

                # SP 探險家
                ("ISFP", "公寓/套房 (無院子)", "長毛貓", "金吉拉貓", "優雅安靜的藝術品", "氣質優雅、不吵不鬧、愛乾淨、神情溫柔", 
                 "ISFP 具備藝術家審美與敏感心靈，金吉拉貓宛如行走的藝術品，安靜陪伴在公寓一角，帶來視覺與心靈的和諧美感。", 
                 "金吉拉毛髮飄逸需防打結，推薦沐曦「深層護髮SPA」與「純清潔」維持毛髮如絲般柔順。", "純清潔 + 深層護髮SPA", 97, "🐱"),

                ("ISFP", "電梯大樓 (中等空間)", "小型犬", "法國鬥牛犬", "呆萌隨和的沙發馬鈴薯", "個性溫和、不愛亂叫、慵懶隨性", 
                 "ISFP 享受當下與隨性生活，法鬥不吵不鬧、喜愛窩在沙發上陪伴，在大樓環境中非常討喜，是零壓力的最佳伴侶。", 
                 "法鬥面部褶皺需細心清潔，推薦沐曦「小美容」進行臉部深層除垢與除蚤洗浴。", "小美容 + 除蚤藥浴", 96, "🐶"),

                ("ISTP", "公寓/套房 (無院子)", "短毛貓", "俄羅斯藍貓", "冷靜敏捷的忍者夥伴", "動作輕盈、獨立自律、低存在感", 
                 "ISTP 喜愛自由與低干擾，俄羅斯藍貓身手敏捷、安靜不喧鬧，在公寓中彼此尊重獨立空間，是最酷的室友！", 
                 "定期基礎洗護推薦沐曦「純清潔」，快速俐落不繁瑣。", "純清潔", 96, "🐱"),

                ("ESTP", "郊區/寬闊空間", "中型犬", "傑克羅素梗", "精力無限的冒險先鋒", "勇往直前、身手矯健、熱愛戶外挑戰", 
                 "ESTP 熱愛戶外運動與刺激冒險，傑克羅素梗精力旺盛、反應極快，在郊區大空間能盡情奔跑玩飛盤，是終極冒險拍檔！", 
                 "戶外運動後易沾染泥土草屑，推薦沐曦「小美容」深層洗淨與「除蚤藥浴」徹底防護！", "小美容 + 除蚤藥浴", 99, "🐕"),

                ("ESFP", "透天厝/有庭院", "小型犬", "柯基犬 / 查理斯王騎士犬", "天生巨星的歡樂夥伴", "熱情好客、表情豐富、隨時準備開派對", 
                 "ESFP 是天生表演者與派對靈魂，熱情甜美的毛孩隨時跟著主人的音樂搖擺，在庭院中接待客人最受歡迎！", 
                 "推薦沐曦「大美容」搭配「深層護髮SPA」，讓毛孩在聚會中閃閃發光！", "大美容 + 深層護髮SPA", 98, "🐶")
            ]

            cur.executemany("""
                INSERT INTO `pet_matches` (
                    `mbti`, `residence`, `pet_type`, `breed_name`, `title`, `personality_traits`,
                    `match_reason`, `care_tips`, `recommended_service`, `match_score`, `image_icon`
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
            """, pet_matches_seeds)

    conn.close()
    print("Database `muxi_db` initialized successfully with seeds!")

if __name__ == "__main__":
    init_db()

