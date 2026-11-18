const SHEET_NAME = 'PAPhumShop';
const WEBHOOK_SECRET = 'REPLACE_WITH_YOUR_GOOGLE_SHEETS_WEBHOOK_SECRET';

const HEADERS = [
  'รหัสไอดี (Code)',
  'สถานะ (Status)',
  'ราคา',
  'ต้นทุน',
  'ดาวน์ขั้นต่ำ (สัปดาห์)',
  'ดาวน์ขั้นต่ำ (เดือน)',
  'แท็ก',
  'อัปเดตล่าสุด'
];

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  const headerRange = sheet.getLastRow() === 0
    ? null
    : sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), HEADERS.length)).getValues()[0];

  const headerMatches =
    headerRange !== null &&
    headerRange.length === HEADERS.length &&
    HEADERS.every(function (value, index) {
      return String(headerRange[index]).trim() === value;
    });

  if (!headerMatches) {
    // ล้างคอลัมน์ credential ที่ค้างจากสคริปต์เวอร์ชันเก่า แล้วสร้างหัวตารางใหม่
    sheet.clearContents();
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function formatAccountRow(acc) {
  return [
    acc.code || '',
    acc.status || '',
    Number(acc.price || 0),
    Number(acc.cost || 0),
    Number(acc.min_down_weekly || 0),
    Number(acc.min_down_monthly || 0),
    Array.isArray(acc.tags) ? acc.tags.join(', ') : (acc.tags || ''),
    acc.updated_at || new Date().toISOString()
  ];
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (!body || body.secret !== WEBHOOK_SECRET) {
      return ContentService.createTextOutput(
        JSON.stringify({ ok: false, error: 'Unauthorized' })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    const sheet = getOrCreateSheet();
    const action = body.action;

    if (action === 'sync_all' && Array.isArray(body.accounts)) {
      sheet.clearContents();
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
      sheet.setFrozenRows(1);

      if (body.accounts.length > 0) {
        const rows = body.accounts.map(formatAccountRow);
        sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
      }

      return ContentService.createTextOutput(
        JSON.stringify({ ok: true, count: body.accounts.length })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'upsert' && body.account) {
      const acc = body.account;
      const rowValues = formatAccountRow(acc);
      const lastRow = sheet.getLastRow();
      let foundRow = -1;

      if (lastRow >= 2) {
        const codes = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        for (let i = 0; i < codes.length; i++) {
          if (String(codes[i][0]).trim() === String(acc.code).trim()) {
            foundRow = i + 2;
            break;
          }
        }
      }

      if (foundRow > 0) {
        sheet.getRange(foundRow, 1, 1, HEADERS.length).setValues([rowValues]);
      } else {
        sheet.appendRow(rowValues);
      }

      return ContentService.createTextOutput(
        JSON.stringify({ ok: true, code: acc.code })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'delete' && body.account && body.account.code) {
      const targetCode = String(body.account.code).trim();
      const lastRow = sheet.getLastRow();
      if (lastRow >= 2) {
        const codes = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        for (let i = codes.length - 1; i >= 0; i--) {
          if (String(codes[i][0]).trim() === targetCode) {
            sheet.deleteRow(i + 2);
          }
        }
      }

      return ContentService.createTextOutput(
        JSON.stringify({ ok: true, deleted: targetCode })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: 'Unknown action' })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: String(err) })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}