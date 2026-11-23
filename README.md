# SimpleStaple — Direct Ordering & Dispatch Stack

Live direct-ordering storefront for **SimpleStaple** (Vasai West):
- **Menu:** `Slow-Cooked Dum Chicken Biryani [550g] + Raita` (₹279 → **₹251** after auto 10% OFF + **FREE Delivery**)
- **WhatsApp Orders:** `+91 77679 72477`
- **UPI ID:** `7767972477@yapl`
- **Target GitHub Pages URL:** `https://triptype.github.io/simplestaple/`

## 2-Minute Go-Live Steps

1. **Enable GitHub Pages:** Open **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `/ (root)` → Save**. Your page goes live at `https://triptype.github.io/simplestaple/` within ~60 seconds.
2. **Add Your 2 Dish Photos:** Upload your `16:9` Brass Handi photo as `assets/hero.jpg` and your `1:1` Matte Black Bowl photo as `assets/dish.jpg` (or replace `index.html` with the self-contained version).
3. **Connect Kitchen KOT & ₹20/Drop Telegram Dispatch:** Paste `SimpleStaple_Dispatch_Bot.gs` into a Google Sheet (`Extensions → Apps Script`), add your `@BotFather` token + Kitchen/Rider chat IDs, deploy as a Web App (`Anyone`), and run `setupSheetsAndWebhook()`.
4. **Backup Hyperlocal Couriers (Built into the Bot):** If no local ₹20/drop rider claims an order within 5 minutes, tap the **⚠️ Trigger Backup** button in Telegram (or type `/backup`) for instant pre-filled dispatch cards with [Porter Mumbai](https://porter.in/two-wheelers/mumbai), [Borzo Mumbai](https://borzodelivery.com/in/mumbai), and [Uber Parcel](https://www.uber.com/in/en/b/courier-services/mumbai-maharashtra-in/).
