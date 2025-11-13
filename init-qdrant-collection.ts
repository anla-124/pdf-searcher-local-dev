/**
 * Initialize Qdrant collection for document embeddings
 * Run with: npx tsx init-qdrant-collection.ts
 */

import { QdrantClient } from '@qdrant/js-client-rest'

async function initQdrantCollection() {
  console.log('🚀 Initializing Qdrant collection...\n')

  const url = process.env['QDRANT_URL'] || 'http://localhost:6333'
  const apiKey = process.env['QDRANT_API_KEY']
  const collectionName = process.env['QDRANT_COLLECTION_NAME'] || 'documents'

  const client = new QdrantClient({
    url,
    ...(apiKey ? { apiKey } : {})
  })

  try {
    // Check if collection already exists
    const collections = await client.getCollections()
    const existingCollection = collections.collections.find(c => c.name === collectionName)

    if (existingCollection) {
      console.log(`⚠️  Collection "${collectionName}" already exists`)
      console.log('   Do you want to recreate it? This will DELETE all existing vectors!')
      console.log('   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n')

      await new Promise(resolve => setTimeout(resolve, 5000))

      console.log(`🗑️  Deleting existing collection "${collectionName}"...`)
      await client.deleteCollection(collectionName)
      console.log('✅ Collection deleted\n')
    }

    // Create collection with optimal settings
    console.log(`🔨 Creating collection "${collectionName}"...`)

    await client.createCollection(collectionName, {
      vectors: {
        size: 768,  // Vertex AI text-embedding-004 dimension
        distance: 'Cosine'  // Cosine similarity
      },
      optimizers_config: {
        default_segment_number: 2
      },
      // Use HNSW index for better performance
      hnsw_config: {
        m: 16,               // Number of connections per layer
        ef_construct: 100,   // Size of dynamic candidate list for construction
        full_scan_threshold: 10000  // Threshold for switching to full scan
      },
      // Enable Write-Ahead Log for durability
      wal_config: {
        wal_capacity_mb: 32
      }
    })

    console.log('✅ Collection created successfully!\n')

    // Create payload indexes for filtering
    console.log('📊 Creating payload indexes for filtering...')

    await client.createPayloadIndex(collectionName, {
      field_name: 'document_id',
      field_schema: 'keyword'
    })
    console.log('   ✓ document_id index created')

    await client.createPayloadIndex(collectionName, {
      field_name: 'user_id',
      field_schema: 'keyword'
    })
    console.log('   ✓ user_id index created')

    await client.createPayloadIndex(collectionName, {
      field_name: 'chunk_index',
      field_schema: 'integer'
    })
    console.log('   ✓ chunk_index index created')

    await client.createPayloadIndex(collectionName, {
      field_name: 'page_number',
      field_schema: 'integer'
    })
    console.log('   ✓ page_number index created')

    console.log('\n🎉 Qdrant collection initialized successfully!\n')

    // Display collection info
    const collectionInfo = await client.getCollection(collectionName)
    console.log('📋 Collection info:')
    console.log(`   Name: ${collectionName}`)
    console.log(`   Vector size: ${collectionInfo.config?.params?.vectors?.size || 768}`)
    console.log(`   Distance: ${collectionInfo.config?.params?.vectors?.distance || 'Cosine'}`)
    console.log(`   Points count: ${collectionInfo.points_count || 0}`)
    console.log(`   Status: ${collectionInfo.status}`)
    console.log('\n✅ Ready to use!')

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

initQdrantCollection()
