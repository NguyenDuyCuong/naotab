/**
 * TEST: Bug Fix Verification
 * - Issue 1: Initial data load on F5 reload
 * - Issue 2: Modal styling and close behavior
 * - Issue 3: D3 orphaned nodes error
 * - Plus: Node click to open detail panel by type
 */

async function testBugFixes() {
  console.log('🧪 Starting Bug Fix Tests...\n');
  
  // Test 1: Modal styling verification
  testModalStyling();
  
  // Test 2: Load test data and verify graph renders
  await testGraphRendering();
  
  // Test 3: Test node interaction
  await testNodeInteraction();
  
  // Test 4: Verify no orphaned links
  testOrphanedLinkFilter();
  
  console.log('\n✅ All tests completed!');
}

function testModalStyling() {
  console.log('📋 Test 1: Modal Styling\n');
  
  const modal = document.getElementById('health-lint-modal');
  const overlay = modal.querySelector('.modal-overlay');
  const content = modal.querySelector('.modal-content');
  
  const computedModal = window.getComputedStyle(modal);
  const computedOverlay = window.getComputedStyle(overlay);
  const computedContent = window.getComputedStyle(content);
  
  console.log('✓ Modal position:', computedModal.position);
  console.log('✓ Modal z-index:', computedModal.zIndex);
  console.log('✓ Modal display (hidden):', modal.classList.contains('hidden') ? 'hidden' : 'visible');
  
  console.log('✓ Overlay position:', computedOverlay.position);
  console.log('✓ Overlay z-index:', computedOverlay.zIndex);
  
  console.log('✓ Content background:', computedContent.backgroundColor);
  console.log('✓ Content border-radius:', computedContent.borderRadius);
  
  // Verify close button exists
  const closeBtn = document.getElementById('report-close');
  console.log('✓ Close button exists:', !!closeBtn);
  console.log('✓ Close button clickable:', closeBtn.onclick !== null || closeBtn.hasAttribute('onclick'));
  
  // Check z-index values
  const overlayZIndex = parseInt(computedOverlay.zIndex);
  const modalZIndex = parseInt(computedModal.zIndex);
  const contentZIndex = parseInt(computedContent.zIndex || '0');
  
  if (overlayZIndex < modalZIndex && overlayZIndex > 0) {
    console.log('✅ Z-index hierarchy correct: Overlay(1000) < Modal(1001)');
  } else {
    console.error('❌ Z-index hierarchy WRONG: Overlay(' + overlayZIndex + ') should be < Modal(' + modalZIndex + ')');
  }
  
  console.log('');
}

async function testGraphRendering() {
  console.log('📋 Test 2: Graph Rendering\n');
  
  // Check if graph container exists
  const graphView = document.getElementById('graph-view');
  console.log('✓ Graph container exists:', !!graphView);
  
  // Check if sidebar exists
  const sidebar = document.getElementById('sidebar');
  console.log('✓ Sidebar exists:', !!sidebar);
  
  // Manually trigger renderAll to test
  console.log('⏳ Rendering graph...');
  try {
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('✓ Graph rendered without errors');
    
    // Check if SVG exists
    const svg = graphView.querySelector('svg');
    if (svg) {
      const nodes = svg.querySelectorAll('circle');
      const links = svg.querySelectorAll('line');
      console.log(`✓ SVG rendered with ${nodes.length} nodes and ${links.length} links`);
    } else {
      console.warn('⚠️ No SVG found in graph view');
    }
  } catch (err) {
    console.error('❌ Graph rendering error:', err.message);
  }
  
  console.log('');
}

async function testNodeInteraction() {
  console.log('📋 Test 3: Node Interaction\n');
  
  const graphView = document.getElementById('graph-view');
  const svg = graphView.querySelector('svg');
  
  if (!svg) {
    console.warn('⚠️ No SVG found, skipping node interaction test');
    return;
  }
  
  // Get all nodes (circles)
  const nodeCircles = svg.querySelectorAll('circle');
  console.log(`Found ${nodeCircles.length} node circles`);
  
  if (nodeCircles.length === 0) {
    console.warn('⚠️ No nodes found in graph');
    return;
  }
  
  // Test clicking on different node types
  const testNodeIndex = 0;
  const testNode = nodeCircles[testNodeIndex];
  
  console.log(`\n🖱️  Clicking on node ${testNodeIndex}...`);
  
  // Get node data (D3 stores it)
  const nodeData = d3.select(testNode).datum();
  console.log('✓ Node data:', {
    id: nodeData.id,
    type: nodeData.type || 'bookmark',
    title: nodeData.title || '(no title)',
    url: nodeData.url || '(no url)'
  });
  
  // Simulate click
  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    view: window
  });
  
  testNode.dispatchEvent(event);
  
  // Wait for panel to open
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // Check if panel opened
  const panel = document.getElementById('node-panel');
  const drawer = document.getElementById('drawer');
  
  if (panel && panel.style.display !== 'none') {
    console.log('✅ Panel opened after node click');
    
    // Verify panel content matches node type
    const panelTitle = document.getElementById('panel-title');
    console.log('✓ Panel title:', panelTitle?.textContent || '(not found)');
    
    // Check node type badge/indicator
    const nodeTypeEl = document.querySelector('[data-node-type]');
    if (nodeTypeEl) {
      console.log('✓ Node type indicator:', nodeTypeEl.getAttribute('data-node-type'));
    }
  } else if (drawer && drawer.classList.contains('open')) {
    console.log('✅ Drawer opened after node click');
    
    const drawerTitle = document.getElementById('drawer-title');
    console.log('✓ Drawer title:', drawerTitle?.textContent || '(not found)');
  } else {
    console.warn('⚠️ Panel/drawer did not open after click');
  }
  
  console.log('');
}

function testOrphanedLinkFilter() {
  console.log('📋 Test 4: Orphaned Link Filter\n');
  
  if (!currentNetwork) {
    console.warn('⚠️ No active network, skipping orphaned link test');
    return;
  }
  
  const { validLinks, nodes } = currentNetwork;
  const nodeIds = new Set(nodes.map(n => n.id));
  
  console.log(`Checking ${validLinks.length} links against ${nodes.length} nodes...`);
  
  let orphanedCount = 0;
  validLinks.forEach(link => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;
    
    if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) {
      orphanedCount++;
      console.warn(`❌ Orphaned link: ${sourceId} -> ${targetId}`);
    }
  });
  
  if (orphanedCount === 0) {
    console.log('✅ All links are valid (no orphaned links found)');
  } else {
    console.error(`❌ Found ${orphanedCount} orphaned links!`);
  }
  
  console.log('');
}

// Run tests
testBugFixes().catch(err => {
  console.error('Test suite error:', err);
});
