import { MiroApi } from "@mirohq/miro-api";

const api = new MiroApi(process.env.MIRO_ACCESS_TOKEN);
const board = await api.getBoard("o9J_kvEVBpQ=");

// Sample items by type
const byType = {};
let count = 0;

for await (const item of board.getAllItems()) {
  count++;
  const type = item.type;

  if (!byType[type]) byType[type] = [];

  if (byType[type].length < 2) {
    byType[type].push({
      id: item.id,
      type: item.type,
      data: item.data,
      style: item.style,
      position: item.position,
      geometry: item.geometry,
      parent: item.parent,
    });
  }
}

console.log(`Total items fetched: ${count}`);
console.log(`Types found: ${Object.keys(byType).join(", ")}`);

for (const [type, items] of Object.entries(byType)) {
  console.log(`\n========== ${type.toUpperCase()} ==========`);
  for (const item of items) {
    console.log(JSON.stringify(item, null, 2));
  }
}

// Sample connectors
console.log("\n========== CONNECTORS ==========");
let connCount = 0;
for await (const conn of board.getAllConnectors()) {
  if (connCount < 3) {
    console.log(JSON.stringify({
      id: conn.id,
      startItem: conn.startItem,
      endItem: conn.endItem,
      shape: conn.shape,
      style: conn.style,
      captions: conn.captions,
    }, null, 2));
  }
  connCount++;
}
console.log(`Total connectors: ${connCount}`);
