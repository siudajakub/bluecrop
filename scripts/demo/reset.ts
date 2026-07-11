const url = process.env.API_URL ?? "http://127.0.0.1:3001";
const response = await fetch(`${url}/api/demo/reset`, { method: "POST" });
if (!response.ok) throw new Error(`Demo reset failed: ${response.status}`);
console.log(await response.json());
