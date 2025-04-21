const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const shapefile = require("shapefile");
const os = require("os");
const fsPromises = fs.promises;

const inputDir = path.join(__dirname, "shp");
const outputDir = path.join(__dirname, "csv");

(async () => {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

  const zipFiles = fs.readdirSync(inputDir).filter(f => f.endsWith(".zip"));

  for (const zipFile of zipFiles) {
    const zipPath = path.join(inputDir, zipFile);
    const zip = new AdmZip(zipPath);

    const tempDir = path.join(os.tmpdir(), `shp_temp_${Date.now()}_${Math.random().toString(36).substring(2)}`);
    fs.mkdirSync(tempDir);

    zip.extractAllTo(tempDir, true);

    const shpFile = fs.readdirSync(tempDir).find(f => f.endsWith(".shp"));
    if (!shpFile) {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
      continue;
    }

    const shpPath = path.join(tempDir, shpFile);
    const csvName = path.basename(zipFile, ".zip") + ".csv";
    const csvPath = path.join(outputDir, csvName);

    const rows = [];
    try {
      const source = await shapefile.open(shpPath);
      let result = await source.read();

      while (!result.done) {
        rows.push(flattenFeature(result.value));
        result = await source.read();
      }

      const csvData = convertToCSV(rows);
      fs.writeFileSync(csvPath, csvData);
    } catch (err) {
      console.error(`Error processing ${zipFile}:`, err);
    }

    await fsPromises.rm(tempDir, { recursive: true, force: true });
  }

  console.log("변환 완료.");
})();

function flattenFeature(obj) {
  const flat = { ...obj.properties };
  if (obj.geometry && obj.geometry.type === "Point") {
    flat.longitude = obj.geometry.coordinates[0];
    flat.latitude = obj.geometry.coordinates[1];
  } else if (obj.geometry) {
    flat.geometry = JSON.stringify(obj.geometry);
  }
  return flat;
}

function convertToCSV(data) {
  if (!data.length) return "";
  const headers = Object.keys(data[0]);
  const lines = data.map(row =>
    headers.map(h => (row[h] !== undefined ? `"${String(row[h]).replace(/"/g, '""')}"` : "")).join(",")
  );
  return [headers.join(","), ...lines].join("\n");
}
