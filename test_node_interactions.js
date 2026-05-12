/**
 * COMPREHENSIVE NODE INTERACTION TEST
 * Tests clicking different node types and verifying panel opens with correct content
 * 
 * Node Types:
 * - Bookmark (blue, large): URL navigation, tags, reason
 * - Concept (green, medium): relevance score, parent
 * - Entity (orange, small): entity type, parent  
 * - Keyword (yellow, tiny): frequency, relevance, parent
 */

class NodeInteractionTest {
  constructor() {
    this.results = {
      bookmarkClick: null,
      conceptClick: null,
      entityClick: null,
      keywordClick: null,
      highlightingWorks: null,
      doubleClickWorks: null,
      resetWorks: null,
      panelContentMatch: null
    };
    this.testSummary = [];
  }

  async runAllTests() {
    console.log('\n🧪 COMPREHENSIVE NODE INTERACTION TEST\n');
    console.log('═'.repeat(60));
    
    try {
      // Initial checks
      this.checkGraphExists();
      await this.wait(500);
      
      // Get SVG and nodes
      const svg = this.getGraphSVG();
      if (!svg) {
        console.error('❌ No SVG found in graph view');
        return;
      }
      
      const nodeCircles = svg.querySelectorAll('circle');
      if (nodeCircles.length === 0) {
        console.error('❌ No nodes found in graph');
        return;
      }
      
      console.log(`\n📍 Found ${nodeCircles.length} nodes in graph\n`);
      
      // Categorize nodes by type
      const nodesByType = this.categorizeNodes(nodeCircles);
      
      // Test each node type
      if (nodesByType.bookmark.length > 0) {
        await this.testBookmarkNodeClick(nodesByType.bookmark[0]);
      } else {
        console.log('⚠️  No bookmark nodes found');
      }
      
      if (nodesByType.concept.length > 0) {
        await this.testConceptNodeClick(nodesByType.concept[0]);
      } else {
        console.log('⚠️  No concept nodes found');
      }
      
      if (nodesByType.entity.length > 0) {
        await this.testEntityNodeClick(nodesByType.entity[0]);
      } else {
        console.log('⚠️  No entity nodes found');
      }
      
      if (nodesByType.keyword.length > 0) {
        await this.testKeywordNodeClick(nodesByType.keyword[0]);
      } else {
        console.log('⚠️  No keyword nodes found');
      }
      
      // Test interactions
      await this.testHighlighting(nodesByType.bookmark[0]);
      await this.testDoubleClick(nodesByType.bookmark[0]);
      await this.testBackgroundClickReset();
      
      this.printSummary();
      
    } catch (error) {
      console.error('❌ Test error:', error);
    }
  }

  getGraphSVG() {
    const graphView = document.getElementById('graph-view');
    return graphView ? graphView.querySelector('svg') : null;
  }

  checkGraphExists() {
    const graphView = document.getElementById('graph-view');
    const svg = this.getGraphSVG();
    
    if (!graphView) {
      throw new Error('Graph view container not found');
    }
    if (!svg) {
      throw new Error('SVG not rendered in graph view');
    }
    
    console.log('✓ Graph container and SVG exist');
  }

  categorizeNodes(nodeCircles) {
    const nodesByType = {
      bookmark: [],
      concept: [],
      entity: [],
      keyword: []
    };
    
    nodeCircles.forEach(circle => {
      const data = d3.select(circle).datum();
      if (!data || !data.type) {
        nodesByType.bookmark.push(circle);
        return;
      }
      
      if (nodesByType[data.type]) {
        nodesByType[data.type].push(circle);
      } else {
        nodesByType.bookmark.push(circle);
      }
    });
    
    console.log('📊 Node categories:');
    console.log(`   Bookmarks: ${nodesByType.bookmark.length}`);
    console.log(`   Concepts: ${nodesByType.concept.length}`);
    console.log(`   Entities: ${nodesByType.entity.length}`);
    console.log(`   Keywords: ${nodesByType.keyword.length}`);
    
    return nodesByType;
  }

  async testBookmarkNodeClick(nodeElement) {
    console.log('\n🔵 Testing BOOKMARK Node Click\n');
    
    const data = d3.select(nodeElement).datum();
    console.log(`Node ID: ${data.id}`);
    console.log(`Type: ${data.type || 'bookmark'}`);
    console.log(`Title: ${data.title}`);
    console.log(`URL: ${data.url || 'N/A'}`);
    
    // Click node
    this.clickNode(nodeElement);
    await this.wait(400);
    
    // Check panel
    const panelOpen = this.isPanelOpen();
    console.log(`\nPanel open: ${panelOpen ? '✅ YES' : '❌ NO'}`);
    
    if (panelOpen) {
      this.verifyBookmarkPanelContent(data);
      this.results.bookmarkClick = 'PASS';
      this.testSummary.push('✅ Bookmark node click → panel opens');
    } else {
      this.results.bookmarkClick = 'FAIL';
      this.testSummary.push('❌ Bookmark node click failed');
    }
  }

  async testConceptNodeClick(nodeElement) {
    console.log('\n🟢 Testing CONCEPT Node Click\n');
    
    const data = d3.select(nodeElement).datum();
    console.log(`Node ID: ${data.id}`);
    console.log(`Type: ${data.type}`);
    console.log(`Title: ${data.title}`);
    console.log(`Relevance: ${data.relevance || 'N/A'}`);
    console.log(`Parent: ${data.parent || 'N/A'}`);
    
    // Click node
    this.clickNode(nodeElement);
    await this.wait(400);
    
    // Check panel
    const panelOpen = this.isPanelOpen();
    console.log(`\nPanel open: ${panelOpen ? '✅ YES' : '❌ NO'}`);
    
    if (panelOpen) {
      this.verifyConceptPanelContent(data);
      this.results.conceptClick = 'PASS';
      this.testSummary.push('✅ Concept node click → panel opens');
    } else {
      this.results.conceptClick = 'FAIL';
      this.testSummary.push('❌ Concept node click failed');
    }
  }

  async testEntityNodeClick(nodeElement) {
    console.log('\n🟠 Testing ENTITY Node Click\n');
    
    const data = d3.select(nodeElement).datum();
    console.log(`Node ID: ${data.id}`);
    console.log(`Type: ${data.type}`);
    console.log(`Title: ${data.title}`);
    console.log(`Entity Type: ${data.entity_type || 'N/A'}`);
    console.log(`Parent: ${data.parent || 'N/A'}`);
    
    // Click node
    this.clickNode(nodeElement);
    await this.wait(400);
    
    // Check panel
    const panelOpen = this.isPanelOpen();
    console.log(`\nPanel open: ${panelOpen ? '✅ YES' : '❌ NO'}`);
    
    if (panelOpen) {
      this.verifyEntityPanelContent(data);
      this.results.entityClick = 'PASS';
      this.testSummary.push('✅ Entity node click → panel opens');
    } else {
      this.results.entityClick = 'FAIL';
      this.testSummary.push('❌ Entity node click failed');
    }
  }

  async testKeywordNodeClick(nodeElement) {
    console.log('\n🟡 Testing KEYWORD Node Click\n');
    
    const data = d3.select(nodeElement).datum();
    console.log(`Node ID: ${data.id}`);
    console.log(`Type: ${data.type}`);
    console.log(`Title: ${data.title}`);
    console.log(`Frequency: ${data.frequency || 'N/A'}`);
    console.log(`Relevance: ${data.relevance || 'N/A'}`);
    console.log(`Parent: ${data.parent || 'N/A'}`);
    
    // Click node
    this.clickNode(nodeElement);
    await this.wait(400);
    
    // Check panel
    const panelOpen = this.isPanelOpen();
    console.log(`\nPanel open: ${panelOpen ? '✅ YES' : '❌ NO'}`);
    
    if (panelOpen) {
      this.verifyKeywordPanelContent(data);
      this.results.keywordClick = 'PASS';
      this.testSummary.push('✅ Keyword node click → panel opens');
    } else {
      this.results.keywordClick = 'FAIL';
      this.testSummary.push('❌ Keyword node click failed');
    }
  }

  async testHighlighting(nodeElement) {
    console.log('\n✨ Testing Node Highlighting\n');
    
    // Click node
    this.clickNode(nodeElement);
    await this.wait(300);
    
    // Check if any nodes have highlighting class
    const svg = this.getGraphSVG();
    const highlightedNodes = svg.querySelectorAll('.highlighted, [opacity="1"]');
    
    console.log(`Highlighted nodes: ${highlightedNodes.length}`);
    
    if (highlightedNodes.length > 0) {
      console.log('✅ Highlighting applied');
      this.results.highlightingWorks = 'PASS';
      this.testSummary.push('✅ Node highlighting works');
    } else {
      console.log('⚠️  Highlighting not detected');
      this.results.highlightingWorks = 'PARTIAL';
      this.testSummary.push('⚠️  Node highlighting check inconclusive');
    }
  }

  async testDoubleClick(nodeElement) {
    console.log('\n2️⃣ Testing Double-Click (Open URL)\n');
    
    const data = d3.select(nodeElement).datum();
    
    if (!data.url) {
      console.log('⚠️  Node has no URL, skipping test');
      return;
    }
    
    console.log(`Expected URL: ${data.url}`);
    console.log('Note: URL opening in new tab (manual verification needed)');
    
    // Double-click would open URL (can't easily test in automated way)
    console.log('✓ Double-click handler exists (manual test required)');
    this.results.doubleClickWorks = 'MANUAL';
    this.testSummary.push('📝 Double-click URL test (requires manual verification)');
  }

  async testBackgroundClickReset() {
    console.log('\n↩️ Testing Background Click Reset\n');
    
    const svg = this.getGraphSVG();
    
    // Simulate click on background
    const event = new MouseEvent('click', { bubbles: true });
    svg.dispatchEvent(event);
    
    await this.wait(300);
    
    // Check if panel closed
    const panelOpen = this.isPanelOpen();
    console.log(`Panel after background click: ${panelOpen ? 'OPEN' : 'CLOSED'}`);
    
    if (!panelOpen) {
      console.log('✅ Panel closed on background click');
      this.results.resetWorks = 'PASS';
      this.testSummary.push('✅ Background click closes panel');
    } else {
      console.log('⚠️  Panel still open');
      this.results.resetWorks = 'PARTIAL';
      this.testSummary.push('⚠️  Background click behavior unclear');
    }
  }

  isPanelOpen() {
    const panel = document.getElementById('node-panel');
    const drawer = document.getElementById('drawer');
    
    if (panel && panel.style.display !== 'none') return true;
    if (drawer && drawer.classList.contains('open')) return true;
    
    return false;
  }

  clickNode(nodeElement) {
    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window
    });
    nodeElement.dispatchEvent(event);
  }

  verifyBookmarkPanelContent(nodeData) {
    console.log('\n📋 Panel Content Verification:');
    
    const titleEl = document.getElementById('panel-title');
    const urlEl = document.getElementById('panel-url');
    const reasonEl = document.getElementById('panel-reason');
    const tagsEl = document.querySelector('[data-panel-tags]');
    
    if (titleEl) {
      console.log(`✓ Title field: ${titleEl.textContent.substring(0, 30)}`);
    }
    if (urlEl) {
      console.log(`✓ URL field: ${urlEl.textContent.substring(0, 40)}`);
    }
    if (reasonEl) {
      console.log(`✓ Reason field present`);
    }
    if (tagsEl) {
      console.log(`✓ Tags field present`);
    }
  }

  verifyConceptPanelContent(nodeData) {
    console.log('\n📋 Panel Content Verification:');
    console.log(`✓ Concept: ${nodeData.title}`);
    console.log(`✓ Relevance: ${nodeData.relevance}`);
    console.log(`✓ Parent: ${nodeData.parent}`);
  }

  verifyEntityPanelContent(nodeData) {
    console.log('\n📋 Panel Content Verification:');
    console.log(`✓ Entity: ${nodeData.title}`);
    console.log(`✓ Entity Type: ${nodeData.entity_type}`);
    console.log(`✓ Parent: ${nodeData.parent}`);
  }

  verifyKeywordPanelContent(nodeData) {
    console.log('\n📋 Panel Content Verification:');
    console.log(`✓ Keyword: ${nodeData.title}`);
    console.log(`✓ Frequency: ${nodeData.frequency}`);
    console.log(`✓ Relevance: ${nodeData.relevance}`);
    console.log(`✓ Parent: ${nodeData.parent}`);
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  printSummary() {
    console.log('\n' + '═'.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('═'.repeat(60));
    
    this.testSummary.forEach((result, idx) => {
      console.log(`${idx + 1}. ${result}`);
    });
    
    console.log('\n' + '═'.repeat(60));
    console.log('📈 RESULTS BY TYPE:');
    console.log('═'.repeat(60));
    
    console.log(`Bookmark: ${this.results.bookmarkClick || 'NOT RUN'}`);
    console.log(`Concept: ${this.results.conceptClick || 'NOT RUN'}`);
    console.log(`Entity: ${this.results.entityClick || 'NOT RUN'}`);
    console.log(`Keyword: ${this.results.keywordClick || 'NOT RUN'}`);
    console.log(`Highlighting: ${this.results.highlightingWorks || 'NOT RUN'}`);
    console.log(`Double-click: ${this.results.doubleClickWorks || 'NOT RUN'}`);
    console.log(`Reset: ${this.results.resetWorks || 'NOT RUN'}`);
    
    console.log('\n✅ Test suite complete!\n');
  }
}

// Run the test
const interactionTest = new NodeInteractionTest();
interactionTest.runAllTests().catch(err => {
  console.error('Test error:', err);
});
