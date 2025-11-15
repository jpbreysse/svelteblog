// Simple test to verify API is working
const BASE_URL = 'http://localhost:5173'; // or your dev server port

async function testAPI() {
  console.log('🧪 Testing Paths API...\n');

  // Test 1: Get all paths as tree
  console.log('1. GET /api/paths?format=tree');
  let res = await fetch(`${BASE_URL}/api/paths?format=tree`);
  let data = await res.json();
  console.log('✅ Response:', data.success ? 'Success' : 'Failed');
  console.log('   Paths count:', data.paths?.length || 0);
  console.log('   Sample path:', data.paths?.[0]?.name);

  // Test 2: Get all paths as flat list
  console.log('\n2. GET /api/paths?format=flat');
  res = await fetch(`${BASE_URL}/api/paths?format=flat`);
  data = await res.json();
  console.log('✅ Response:', data.success ? 'Success' : 'Failed');
  console.log('   Total paths:', data.paths?.length || 0);

  // Test 3: Get specific path
  console.log('\n3. GET /api/paths/2');
  res = await fetch(`${BASE_URL}/api/paths/2`);
  data = await res.json();
  console.log('✅ Response:', data.success ? 'Success' : 'Failed');
  console.log('   Path:', data.path?.full_path);
  console.log('   Children:', data.path?.children?.length || 0);
  console.log('   Posts:', data.path?.stats?.direct_posts || 0);

  // Test 4: Search
  console.log('\n4. GET /api/paths/search?q=backend');
  res = await fetch(`${BASE_URL}/api/paths/search?q=backend`);
  data = await res.json();
  console.log('✅ Response:', data.success ? 'Success' : 'Failed');
  console.log('   Results:', data.results?.length || 0);
  if (data.results?.length > 0) {
    console.log('   Found:', data.results.map(p => p.name).join(', '));
  }

  // Test 5: Get tree view
  console.log('\n5. GET /api/paths/tree');
  res = await fetch(`${BASE_URL}/api/paths/tree`);
  data = await res.json();
  console.log('✅ Response:', data.success ? 'Success' : 'Failed');
  console.log('   Tree nodes:', data.tree?.length || 0);
  console.log('   Stats:', data.stats);

  // Test 6: Get path by full_path
  console.log('\n6. GET /api/paths/by-path?path=/technical');
  res = await fetch(`${BASE_URL}/api/paths/by-path?path=/technical`);
  data = await res.json();
  console.log('✅ Response:', data.success ? 'Success' : 'Failed');
  console.log('   Path:', data.path?.name);
  console.log('   Children:', data.path?.children?.length || 0);

  console.log('\n✨ API tests complete!');
}

testAPI().catch(console.error);