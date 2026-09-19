# Online Rating Control Center

داشبورد محلی و فقط‌خواندنی برای مشاهدهٔ Rating پلتفرم‌های سفارش آنلاین.

نسخهٔ ۰.۱.۰ فقط به Database واقعی Talabat Rating Monitor متصل می‌شود. Adapterهای Keeta، Noon، Careem و Deliveroo آماده‌اند اما تا زمان معرفی Database مربوطه، وضعیت Not Connected نشان می‌دهند.

## اصول ایمنی

- Dashboard فقط روی `127.0.0.1:3000` گوش می‌دهد.
- SQLite با گزینهٔ `readOnly` باز می‌شود.
- روی Connection دستور `query_only` فعال می‌شود.
- هیچ Query از نوع Insert، Update، Delete یا Migration وجود ندارد.
- Dashboard اجرای Monitor را Trigger نمی‌کند.
- هیچ Cookie، Session، Telegram Token یا Secret داخل پروژه نیست.
- Schema یا فایل‌های Talabat Monitor تغییر نمی‌کنند.

## اجرای سریع روی Windows

۱. ZIP را در مسیر ثابتی مانند `C:\RatingControlCenter` Extract کنید.

۲. `install-windows.ps1` را با PowerShell اجرا کنید.

۳. در فایل `.env`، مسیر Database واقعی Talabat را در `TALABAT_DB_PATH` قرار دهید.

۴. فایل `start-dashboard.bat` را اجرا کنید.

۵. آدرس `http://127.0.0.1:3000` را باز کنید.

راهنمای کامل در فایل `WINDOWS-SETUP-FA.md` قرار دارد.
