# מדיה לדף הנחיתה / Landing media

שימו קבצים בתיקייה הזו ורשמו אותם ב-`media.json`. שדה ריק = מציגים מקום שמור.

- `heroImage`: תמונה ראשית (למשל `assets/hero.jpg`), מוצגת בראש הדף.
- `heroVideo` + `heroPoster`: סרטון קצר ראשי (mp4) ותמונת פתיחה שלו. אם יש סרטון, הוא מחליף את התמונה הראשית.
- `mainVideo`: סרטון ההסבר/הפרסומת (mp4 או קישור YouTube embed), מוצג בסעיף "איך זה עובד".
- `ownerPhoto`: תמונה של מאיר.
- `gallery`: רשימה של `{ "type": "image" | "video", "src": "assets/x.jpg", "alt": "תיאור" }`.

מומלץ: תמונות עד 200KB (WebP/JPG), סרטונים עד כמה MB, או להעלות ל-Cloudinary ולהדביק כתובת מלאה.
