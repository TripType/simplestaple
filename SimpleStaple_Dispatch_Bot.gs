/**
 * SimpleStaple — Zero-Overhead Direct Order, Kitchen KOT, ₹20/Drop Rider Dispatch
 * & Hyperlocal Backup Escalation (Borzo / Porter / Uber Parcel)
 *
 * Brand: SimpleStaple (Vasai West, Maharashtra)
 * WhatsApp Order Line: +91 77679 72477
 * UPI ID: 7767972477@yapl
 *
 * SETUP (5 minutes):
 * 1. Open a new Google Sheet -> Extensions -> Apps Script -> paste this file.
 * 2. Fill BOT_TOKEN, KITCHEN_CHAT_ID, and RIDER_GROUP_CHAT_ID below.
 * 3. Deploy -> New deployment -> Web app -> Execute as: Me -> Who has access: Anyone.
 * 4. Copy the Web App URL into WEB_APP_URL below, save, then run `setupSheetsAndWebhook()`.
 * 5. Paste the same Web App URL into Settings (gear icon) on https://triptype.github.io/simplestaple/
 */

const CONFIG = {
  BRAND_NAME: 'SimpleStaple',
  OWNER_WHATSAPP: '917767972477',
  UPI_ID: '7767972477@yapl',
  KITCHEN_PICKUP_LABEL: 'SimpleStaple Kitchen, Vasai West',
  RIDER_PAYOUT_PER_DROP: 20, // ₹20/drop local Vasai West rider pool

  // Fill these 4 values before running setupSheetsAndWebhook():
  BOT_TOKEN: 'YOUR_TELEGRAM_BOT_TOKEN_FROM_BOTFATHER',
  KITCHEN_CHAT_ID: 'YOUR_KITCHEN_TELEGRAM_CHAT_ID',
  RIDER_GROUP_CHAT_ID: 'YOUR_RIDER_GROUP_TELEGRAM_CHAT_ID',
  WEB_APP_URL: 'YOUR_DEPLOYED_APPS_SCRIPT_WEB_APP_URL',

  // Backup hyperlocal courier links when no local ₹20/drop rider is available
  BACKUP_COURIERS: {
    PORTER: 'https://porter.in/two-wheelers/mumbai',
    BORZO: 'https://borzodelivery.com/in/mumbai',
    UBER_PARCEL: 'https://www.uber.com/in/en/b/courier-services/mumbai-maharashtra-in/'
  }
};

const SHEET_NAMES = {
  ORDERS: 'Orders',
  PAYOUTS: 'RiderPayouts',
  CUSTOMERS: 'RepeatCustomers'
};

/**
 * Run once after deploying Web App to initialize tabs and register Telegram webhook.
 */
function setupSheetsAndWebhook() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let ordersSheet = ss.getSheetByName(SHEET_NAMES.ORDERS);
  if (!ordersSheet) {
    ordersSheet = ss.insertSheet(SHEET_NAMES.ORDERS);
    ordersSheet.appendRow([
      'Timestamp', 'OrderID', 'CustomerName', 'CustomerPhone', 'Fulfillment',
      'Slot', 'Items', 'Subtotal', 'Discount', 'DeliveryFee', 'TotalPayable',
      'UpiRef', 'Address', 'GpsUrl', 'Status', 'ClaimedBy', 'RiderTelegramId',
      'DeliveryChannel', 'DeliveredAt'
    ]);
    ordersSheet.setFrozenRows(1);
  }

  let payoutsSheet = ss.getSheetByName(SHEET_NAMES.PAYOUTS);
  if (!payoutsSheet) {
    payoutsSheet = ss.insertSheet(SHEET_NAMES.PAYOUTS);
    payoutsSheet.appendRow([
      'Date', 'OrderID', 'RiderName', 'RiderTelegramId', 'PayoutINR', 'PaidStatus'
    ]);
    payoutsSheet.setFrozenRows(1);
  }

  let custSheet = ss.getSheetByName(SHEET_NAMES.CUSTOMERS);
  if (!custSheet) {
    custSheet = ss.insertSheet(SHEET_NAMES.CUSTOMERS);
    custSheet.appendRow([
      'CustomerPhone', 'CustomerName', 'LastAddress', 'FirstOrderDate', 'LastOrderDate', 'TotalOrders', 'TotalSpendINR'
    ]);
    custSheet.setFrozenRows(1);
  }

  if (CONFIG.BOT_TOKEN && !CONFIG.BOT_TOKEN.startsWith('YOUR_') &&
      CONFIG.WEB_APP_URL && !CONFIG.WEB_APP_URL.startsWith('YOUR_')) {
    const res = UrlFetchApp.fetch(
      `https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/setWebhook?url=${encodeURIComponent(CONFIG.WEB_APP_URL)}`
    );
    Logger.log('Telegram Webhook Response: ' + res.getContentText());
  } else {
    Logger.log('Sheets initialized. Fill BOT_TOKEN and WEB_APP_URL to register Telegram webhook.');
  }
}

/**
 * Unified POST endpoint:
 * - Handles JSON orders sent from https://triptype.github.io/simplestaple/
 * - Handles Telegram Bot webhook updates (Claim / Delivered / Backup Courier / /payout)
 */
function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const data = JSON.parse(raw);

    if (data.callback_query) {
      handleTelegramCallback(data.callback_query);
      return jsonOk({ ok: true });
    }

    if (data.message && data.message.text) {
      handleTelegramCommand(data.message);
      return jsonOk({ ok: true });
    }

    if (data.orderId && data.items) {
      handleIncomingWebOrder(data);
      return jsonOk({ ok: true, orderId: data.orderId });
    }

    return jsonOk({ ok: true, ignored: true });
  } catch (err) {
    Logger.log('doPost error: ' + err);
    return jsonOk({ ok: false, error: String(err) });
  }
}

function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({ status: 'live', brand: CONFIG.BRAND_NAME })
  ).setMimeType(ContentService.MimeType.JSON);
}

function handleIncomingWebOrder(order) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ordersSheet = ss.getSheetByName(SHEET_NAMES.ORDERS);
  const now = new Date();
  const ts = Utilities.formatDate(now, 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss');

  const isPickup = order.mode === 'pickup';
  ordersSheet.appendRow([
    ts,
    order.orderId,
    order.customerName || '',
    order.customerPhone || '',
    isPickup ? 'Self-Pickup' : 'Delivery',
    order.slot || 'ASAP',
    order.itemsText || '',
    order.subtotal || 0,
    order.discount || 0,
    order.deliveryFee || 0,
    order.total || 0,
    order.upiRef || '',
    order.address || '',
    order.gpsUrl || '',
    isPickup ? 'READY_FOR_PICKUP' : 'OPEN_FOR_RIDER',
    '',
    '',
    isPickup ? 'Self-Pickup' : 'Local ₹20 Pool',
    ''
  ]);

  upsertRepeatCustomer(order, ts);

  const kotLines = [
    `🔥 *NEW ${CONFIG.BRAND_NAME.toUpperCase()} KOT — ${order.orderId}*`,
    `📦 *Items:* ${order.itemsText}`,
    `💰 *Total:* ₹${order.total} ${order.upiRef ? `(UPI Ref: ${order.upiRef})` : '(Verify UPI)'}`,
    `🚚 *Mode:* ${isPickup ? 'Self-Pickup' : 'Delivery (' + (order.slot || 'ASAP') + ')'}`,
    `👤 *Customer:* ${order.customerName || 'Guest'} (${order.customerPhone || 'N/A'})`
  ];
  if (!isPickup) {
    kotLines.push(`📍 *Address:* ${order.address || 'Check WhatsApp'}`);
    if (order.gpsUrl) kotLines.push(`🗺️ *GPS:* ${order.gpsUrl}`);
  }
  if (order.note) kotLines.push(`📝 *Note:* ${order.note}`);

  const kitchenKeyboard = isPickup ? null : {
    inline_keyboard: [[
      { text: '⚠️ No Local Rider? Trigger Backup (Porter/Borzo/Uber)', callback_data: `BACKUP|${order.orderId}` }
    ]]
  };

  sendTelegramMessage(CONFIG.KITCHEN_CHAT_ID, kotLines.join('\n'), kitchenKeyboard);

  if (!isPickup) {
    const riderLines = [
      `🛵 *₹${CONFIG.RIDER_PAYOUT_PER_DROP} DROP AVAILABLE — ${order.orderId}*`,
      `📍 *Pickup:* ${CONFIG.KITCHEN_PICKUP_LABEL}`,
      `🏠 *Drop:* ${order.address || 'Vasai West'}`,
      order.gpsUrl ? `🗺️ *Map Pin:* ${order.gpsUrl}` : '',
      `⏱️ *Slot:* ${order.slot || 'ASAP (Ready in ~15 mins)'}`,
      `💵 *Payout:* ₹${CONFIG.RIDER_PAYOUT_PER_DROP} (settled nightly via UPI)`
    ].filter(Boolean);

    const riderKeyboard = {
      inline_keyboard: [[
        { text: `✅ Claim ₹${CONFIG.RIDER_PAYOUT_PER_DROP} Drop`, callback_data: `CLAIM|${order.orderId}` }
      ]]
    };

    sendTelegramMessage(CONFIG.RIDER_GROUP_CHAT_ID, riderLines.join('\n'), riderKeyboard);
  }
}

function handleTelegramCallback(cb) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const parts = String(cb.data || '').split('|');
    const action = parts[0];
    const orderId = parts[1];
    const user = cb.from || {};
    const riderName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || 'Rider';
    const riderId = String(user.id || '');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.ORDERS);
    const rows = sheet.getDataRange().getValues();
    let rowIdx = -1;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][1]) === orderId) { rowIdx = i + 1; break; }
    }
    if (rowIdx === -1) {
      answerCallback(cb.id, 'Order not found.');
      return;
    }

    const row = rows[rowIdx - 1];
    const status = String(row[14]);
    const custName = String(row[2] || 'Customer');
    const custPhone = String(row[3] || '').replace(/\D/g, '');
    const address = String(row[12] || '');
    const gpsUrl = String(row[13] || '');

    if (action === 'CLAIM') {
      if (status !== 'OPEN_FOR_RIDER') {
        answerCallback(cb.id, 'Already claimed or escalated!');
        return;
      }
      sheet.getRange(rowIdx, 15).setValue('CLAIMED');
      sheet.getRange(rowIdx, 16).setValue(riderName);
      sheet.getRange(rowIdx, 17).setValue(riderId);
      sheet.getRange(rowIdx, 18).setValue('Local ₹20 Pool');

      answerCallback(cb.id, `Claimed ${orderId}! Head to pickup.`);

      editTelegramMessage(
        cb.message.chat.id,
        cb.message.message_id,
        `✅ *CLAIMED BY ${riderName.toUpperCase()} — ${orderId}*\n🏠 *Drop:* ${address}\n${gpsUrl ? `🗺️ *Map:* ${gpsUrl}\n` : ''}👤 *Customer:* ${custName} (${custPhone})`,
        {
          inline_keyboard: [[
            { text: '📦 Mark Delivered', callback_data: `DELIVERED|${orderId}` }
          ]]
        }
      );

      const waPhone = custPhone.length === 10 ? '91' + custPhone : custPhone;
      const outMsg = encodeURIComponent(
        `Hi ${custName}, your ${CONFIG.BRAND_NAME} order (${orderId}) is freshly packed and out for delivery with ${riderName}! 🍛`
      );
      const waPingUrl = waPhone ? `https://wa.me/${waPhone}?text=${outMsg}` : '';

      const kitchenNotice = [
        `🛵 *Rider Claimed ${orderId}:* ${riderName}`,
        waPingUrl ? `📲 [1-Tap Out-for-Delivery WhatsApp Ping](${waPingUrl})` : ''
      ].filter(Boolean).join('\n');

      sendTelegramMessage(CONFIG.KITCHEN_CHAT_ID, kitchenNotice, null);
    }

    else if (action === 'DELIVERED') {
      if (status === 'DELIVERED') {
        answerCallback(cb.id, 'Already marked delivered.');
        return;
      }
      const now = new Date();
      const dateStr = Utilities.formatDate(now, 'Asia/Kolkata', 'yyyy-MM-dd');
      const tsStr = Utilities.formatDate(now, 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss');

      sheet.getRange(rowIdx, 15).setValue('DELIVERED');
      sheet.getRange(rowIdx, 19).setValue(tsStr);

      const payoutsSheet = ss.getSheetByName(SHEET_NAMES.PAYOUTS);
      payoutsSheet.appendRow([
        dateStr, orderId, row[15] || riderName, row[16] || riderId, CONFIG.RIDER_PAYOUT_PER_DROP, 'UNPAID'
      ]);

      answerCallback(cb.id, `Delivered! ₹${CONFIG.RIDER_PAYOUT_PER_DROP} credited.`);
      editTelegramMessage(
        cb.message.chat.id,
        cb.message.message_id,
        `🏁 *DELIVERED — ${orderId}*\nRider: ${row[15] || riderName}\nLogged: ₹${CONFIG.RIDER_PAYOUT_PER_DROP} payout`,
        null
      );
      sendTelegramMessage(CONFIG.KITCHEN_CHAT_ID, `🏁 *${orderId} Delivered* by ${row[15] || riderName}.`, null);
    }

    else if (action === 'BACKUP') {
      if (status === 'DELIVERED' || status === 'CLAIMED') {
        answerCallback(cb.id, `Order is already ${status}.`);
        return;
      }
      sheet.getRange(rowIdx, 15).setValue('BACKUP_COURIER');
      sheet.getRange(rowIdx, 18).setValue('Backup (Porter/Borzo/Uber)');
      answerCallback(cb.id, 'Backup courier card generated!');

      const backupCard = [
        `🚨 *BACKUP COURIER DISPATCH — ${orderId}*`,
        `No local ₹20 rider claimed in time. Book a 2-wheeler instantly:`,
        ``,
        `📍 *Pickup:* ${CONFIG.KITCHEN_PICKUP_LABEL}`,
        `🏠 *Drop:* ${address}`,
        gpsUrl ? `🗺️ *Drop GPS:* ${gpsUrl}` : '',
        `👤 *Receiver:* ${custName} — ${custPhone}`,
        ``,
        `⚡ *Quick Book Links:*`,
        `• [Porter 2-Wheeler Mumbai](${CONFIG.BACKUP_COURIERS.PORTER}) *(starts ~₹48)*`,
        `• [Borzo Mumbai](${CONFIG.BACKUP_COURIERS.BORZO})`,
        `• [Uber Parcel Mumbai](${CONFIG.BACKUP_COURIERS.UBER_PARCEL})`
      ].filter(Boolean).join('\n');

      sendTelegramMessage(CONFIG.KITCHEN_CHAT_ID, backupCard, null);
    }
  } finally {
    lock.releaseLock();
  }
}

function handleTelegramCommand(msg) {
  const text = String(msg.text || '').trim().toLowerCase();
  const chatId = msg.chat.id;

  if (text.startsWith('/payout')) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const payouts = ss.getSheetByName(SHEET_NAMES.PAYOUTS).getDataRange().getValues();
    const today = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
    const totals = {};
    let grand = 0;

    for (let i = 1; i < payouts.length; i++) {
      const [date, , rider, , amt, paid] = payouts[i];
      if (String(date) === today && String(paid) !== 'PAID') {
        totals[rider] = (totals[rider] || 0) + Number(amt || 0);
        grand += Number(amt || 0);
      }
    }

    const lines = [`💵 *${CONFIG.BRAND_NAME} Rider Payouts (${today})*`];
    const riders = Object.keys(totals);
    if (riders.length === 0) {
      lines.push('No unpaid drops logged today.');
    } else {
      riders.forEach(r => lines.push(`• ${r}: *₹${totals[r]}*`));
      lines.push(`\n*Total Due Tonight: ₹${grand}*`);
    }
    sendTelegramMessage(chatId, lines.join('\n'), null);
  }

  else if (text.startsWith('/backup')) {
    const msgText = [
      `🛵 *${CONFIG.BRAND_NAME} Backup Hyperlocal Couriers (Vasai West / MMR)*`,
      `Use these whenever local ₹20/drop riders are offline or during rain/peak rush:`,
      `• [Porter 2-Wheeler Mumbai](${CONFIG.BACKUP_COURIERS.PORTER})`,
      `• [Borzo Mumbai](${CONFIG.BACKUP_COURIERS.BORZO})`,
      `• [Uber Parcel Mumbai](${CONFIG.BACKUP_COURIERS.UBER_PARCEL})`
    ].join('\n');
    sendTelegramMessage(chatId, msgText, null);
  }
}

function upsertRepeatCustomer(order, ts) {
  const phone = String(order.customerPhone || '').replace(/\D/g, '');
  if (!phone) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.CUSTOMERS);
  if (!sheet) return;
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).replace(/\D/g, '') === phone) {
      const count = Number(rows[i][5] || 0) + 1;
      const spend = Number(rows[i][6] || 0) + Number(order.total || 0);
      sheet.getRange(i + 1, 2).setValue(order.customerName || rows[i][1]);
      sheet.getRange(i + 1, 3).setValue(order.address || rows[i][2]);
      sheet.getRange(i + 1, 5).setValue(ts);
      sheet.getRange(i + 1, 6).setValue(count);
      sheet.getRange(i + 1, 7).setValue(spend);
      return;
    }
  }
  sheet.appendRow([phone, order.customerName || '', order.address || '', ts, ts, 1, Number(order.total || 0)]);
}

function sendTelegramMessage(chatId, text, replyMarkup) {
  if (!CONFIG.BOT_TOKEN || CONFIG.BOT_TOKEN.startsWith('YOUR_')) return;
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: 'Markdown',
    disable_web_page_preview: true
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  UrlFetchApp.fetch(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

function editTelegramMessage(chatId, messageId, text, replyMarkup) {
  if (!CONFIG.BOT_TOKEN || CONFIG.BOT_TOKEN.startsWith('YOUR_')) return;
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: 'Markdown',
    disable_web_page_preview: true
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  UrlFetchApp.fetch(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/editMessageText`, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

function answerCallback(callbackId, text) {
  if (!CONFIG.BOT_TOKEN || CONFIG.BOT_TOKEN.startsWith('YOUR_')) return;
  UrlFetchApp.fetch(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/answerCallbackQuery`, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ callback_query_id: callbackId, text: text }),
    muteHttpExceptions: true
  });
}

function jsonOk(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
