/**
 * Sincroniza respuestas de formularios del Club (Cloudflare) → Google Sheets.
 *
 * Setup recomendado (script ligado a la hoja):
 * 1. Crea una hoja en https://sheets.google.com (p. ej. "Círculo Latino — Casos").
 * 2. En ESA hoja: Extensiones → Apps Script. Pega este archivo.
 * 3. Engranaje → Propiedades de la secuencia de comandos:
 *      CLUB_EXPORT_TOKEN  = contenido de .secrets/club-admin-token
 *      CLUB_FORM_ID       = circulo-latino-c1-a1-casos
 *      CLUB_WORKER_URL    = https://drz-club-portal.drz-academy.workers.dev  (opcional)
 *      CLUB_SHEET_NAME    = Respuestas   (opcional)
 * 4. Ejecuta syncClubFormResponses y autoriza.
 * 5. Activadores → reloj → syncClubFormResponses (cada hora / cada día).
 *
 * Si el proyecto ya es independiente (no ligado a una hoja), añade también:
 *      CLUB_SPREADSHEET_ID = el id de la URL de la hoja
 *      (https://docs.google.com/spreadsheets/d/ESTE_ID/edit)
 *
 * Cada ejecución reemplaza la pestaña con el CSV actual del Worker.
 */

var DEFAULT_WORKER = "https://drz-club-portal.drz-academy.workers.dev";
var DEFAULT_SHEET = "Respuestas";

function openTargetSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;

  var id = String(props.getProperty("CLUB_SPREADSHEET_ID") || "").trim();
  if (id) {
    ss = SpreadsheetApp.openById(id);
    if (ss) return ss;
  }

  throw new Error(
    "No hay hoja activa. Crea una hoja de cálculo, abre Extensiones → Apps Script desde esa hoja "
    + "y pega el script ahí; o define CLUB_SPREADSHEET_ID en Propiedades (el id de la URL /d/ID/edit)."
  );
}

function syncClubFormResponses() {
  var props = PropertiesService.getScriptProperties();
  var token = String(props.getProperty("CLUB_EXPORT_TOKEN") || "").trim();
  var formId = String(props.getProperty("CLUB_FORM_ID") || "").trim();
  var worker = String(props.getProperty("CLUB_WORKER_URL") || DEFAULT_WORKER).trim().replace(/\/$/, "");
  var sheetName = String(props.getProperty("CLUB_SHEET_NAME") || DEFAULT_SHEET).trim() || DEFAULT_SHEET;

  if (!token) throw new Error("Falta CLUB_EXPORT_TOKEN en Propiedades del script.");
  if (!formId) throw new Error("Falta CLUB_FORM_ID en Propiedades del script.");

  var url = worker + "/forms/export?form=" + encodeURIComponent(formId);
  var res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: {
      Accept: "text/csv",
      Authorization: "Bearer " + token,
    },
    muteHttpExceptions: true,
  });

  var code = res.getResponseCode();
  var body = res.getContentText("UTF-8");
  if (code !== 200) {
    throw new Error("Export falló (" + code + "): " + body.slice(0, 300));
  }

  var rows = Utilities.parseCsv(body);
  var ss = openTargetSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  sheet.clearContents();
  if (!rows.length) {
    sheet.getRange(1, 1).setValue("(Sin respuestas todavía)");
  } else {
    sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  }

  ensureSyncStamp_(ss, formId, rows.length ? rows.length - 1 : 0);
}

function ensureSyncStamp_(ss, formId, count) {
  var metaName = "_sync";
  var meta = ss.getSheetByName(metaName);
  if (!meta) {
    meta = ss.insertSheet(metaName);
    meta.hideSheet();
    meta.getRange(1, 1, 1, 3).setValues([["form_id", "synced_at", "respuestas"]]);
  }
  meta.getRange(2, 1, 1, 3).setValues([[formId, new Date().toISOString(), count]]);
}

/** Prueba manual desde el editor de Apps Script. */
function testSyncClubFormResponses() {
  syncClubFormResponses();
}
