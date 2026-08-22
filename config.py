import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "muxi_secret_key_2026")
    DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
    DB_PORT = int(os.getenv("DB_PORT", 3306))
    DB_USER = os.getenv("DB_USER", "root")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "Fyu0410@")
    DB_NAME = os.getenv("DB_NAME", "muxi_db")
