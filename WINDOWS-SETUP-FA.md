# راه‌اندازی Online Rating Control Center روی Windows

## پیش‌نیاز

Node.js نسخهٔ ۲۴ از قبل روی کامپیوتر نصب باشد. Talabat Rating Monitor نیز باید عملیاتی باشد و Database آن Snapshot معتبر داشته باشد.

## نصب

۱. فایل ZIP را Extract کنید. مسیر پیشنهادی:

```text
C:\RatingControlCenter
```

۲. وارد پوشه شوید.

۳. روی `install-windows.ps1` راست‌کلیک کنید و Run with PowerShell را بزنید.

نصب‌کننده Dependencies را نصب، پروژه را Build و فایل `.env` را ایجاد می‌کند. هیچ Scheduled Task و هیچ سرویس اینترنتی ساخته نمی‌شود.

اگر اجرای PowerShell مسدود شد، PowerShell را داخل پوشه باز کنید و این دستور را بزنید:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1
```

## اتصال به Database واقعی Talabat

فایل `.env` را با Notepad باز کنید. مسیر واقعی فایل `talabat-monitor.db` را مقابل متغیر زیر قرار دهید:

```text
TALABAT_DB_PATH=C:\TalabatRatingMonitor\data\talabat-monitor.db
```

اگر پروژهٔ Monitor در مسیر دیگری نصب شده، همین مسیر را متناسب با محل واقعی اصلاح کنید.

Dashboard فایل Database را در حالت Read-only باز می‌کند. هیچ تغییری در جدول‌ها یا Snapshotهای Monitor ایجاد نمی‌شود.

فایل `.env` فقط شامل تنظیمات Dashboard و مسیر Database است. Telegram Token، Session، Cookie یا OTP را در این پروژه کپی نکنید.

## اجرای Dashboard

فایل `start-dashboard.bat` را اجرا کنید. پنجرهٔ مشکی باید باز بماند. مرورگر پس از چند ثانیه آدرس زیر را باز می‌کند:

```text
http://127.0.0.1:3000
```

این آدرس فقط روی همان کامپیوتر قابل‌استفاده است و روی شبکه یا اینترنت منتشر نمی‌شود.

## توقف Dashboard

پنجرهٔ مشکی Dashboard را انتخاب کنید و کلیدهای `Ctrl+C` را بزنید. در صورت سؤال Windows، حرف `Y` را وارد کنید.

## بررسی اتصال

در حالی که Dashboard باز است، فایل `check-connection.bat` را اجرا کنید. اگر اتصال Server برقرار باشد، مقدار `ok: true` نمایش داده می‌شود.

اگر داخل Dashboard پیام Database not found دیده شد:

۱. محل واقعی `talabat-monitor.db` را پیدا کنید.

۲. مسیر `TALABAT_DB_PATH` را در `.env` اصلاح کنید.

۳. Dashboard را ببندید و دوباره `start-dashboard.bat` را اجرا کنید.

## Auto-refresh

Dashboard هر ۶۰ ثانیه Database را دوباره می‌خواند. این Refresh فقط Query خواندنی اجرا می‌کند و باعث اجرای Talabat Monitor نمی‌شود.

برای تغییر فاصلهٔ Refresh، مقدار زیر را در `.env` تغییر دهید:

```text
AUTO_REFRESH_SECONDS=60
```

## نکات عملیاتی

- فایل Database را جابه‌جا یا Rename نکنید.
- نیازی به کپی‌کردن Database داخل پوشهٔ Dashboard نیست.
- Talabat Monitor و Dashboard می‌توانند هم‌زمان کار کنند.
- فقط Snapshotهای مربوط به Runهای موفق نمایش داده می‌شوند.
- وضعیت شعب از مقدار ثبت‌شده توسط Rule Engine خود Monitor خوانده می‌شود.
- شعب بدون Rating با وضعیت `UNRATED` نمایش داده می‌شوند.
