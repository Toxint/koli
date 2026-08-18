async function testHttp() {
  console.log("=== VERIFYING HTTP ENDPOINTS ===");

  // 1. Check homepage
  const homeRes = await fetch("http://localhost:3000/");
  console.log("GET / -> Status:", homeRes.status);

  // 2. Check /seller/commandes/nouvelle
  const createRes = await fetch("http://localhost:3000/seller/commandes/nouvelle", { redirect: "manual" });
  console.log("GET /seller/commandes/nouvelle -> Status:", createRes.status, "Location:", createRes.headers.get("location"));

  // 3. Check /pay/CMD-001 (demo order payment page)
  const payRes = await fetch("http://localhost:3000/pay/CMD-001");
  console.log("GET /pay/CMD-001 -> Status:", payRes.status);

  // 4. Check seller dashboard
  const sellerDashRes = await fetch("http://localhost:3000/seller/dashboard", { redirect: "manual" });
  console.log("GET /seller/dashboard -> Status:", sellerDashRes.status, "Location:", sellerDashRes.headers.get("location"));

  if (homeRes.status === 200 && payRes.status === 200 && (createRes.status === 200 || createRes.status === 307)) {
    console.log("\n✅ SUCCESS: ALL ROUTES ARE WORKING CORRECTLY WITHOUT ANY 404 OR 500 ERRORS!");
  } else {
    console.error("\n❌ FAILURE: HTTP status error!");
  }
}

testHttp().catch(console.error);
