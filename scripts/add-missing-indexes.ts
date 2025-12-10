/**
 * Add missing payload indexes to existing Qdrant collection
 * This does NOT delete existing data - it only adds new indexes
 * Run with: npx tsx add-missing-indexes.ts
 */

/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { QdrantClient } from '@qdrant/js-client-rest'
import { config } from 'dotenv'
import path from 'path'

// Load environment variables from .env.local
config({ path: path.join(process.cwd(), '.env.local') })

async function addMissingIndexes() {
  console.log('🚀 Adding missing payload indexes to Qdrant collection...\n')

  const url = process.env['QDRANT_URL'] || 'http://localhost:6333'
  const apiKey = process.env['QDRANT_API_KEY']
  const collectionName = process.env['QDRANT_COLLECTION_NAME'] || 'documents'

  console.log(`🔗 Connecting to: ${url}`)
  console.log(`📦 Collection: ${collectionName}\n`)

  const client = new QdrantClient({
    url,
    ...(apiKey ? { apiKey } : {})
  })

  try {
    // Verify collection exists
    const collections = await client.getCollections()
    const existingCollection = collections.collections.find(c => c.name === collectionName)

    if (!existingCollection) {
      console.error(`❌ Collection "${collectionName}" does not exist!`)
      console.log('   Run init-qdrant-collection.ts first to create the collection.')
      process.exit(1)
    }

    console.log(`✅ Found collection "${collectionName}"`)
    console.log('📊 Adding business metadata payload indexes...\n')

    // Add law_firm index
    try {
      await client.createPayloadIndex(collectionName, {
        field_name: 'law_firm',
        field_schema: 'keyword'
      })
      console.log('   ✅ law_firm index created')
    } catch (error: any) {
      if (error?.message?.includes('already exists')) {
        console.log('   ⏭️  law_firm index already exists (skipping)')
      } else {
        throw error
      }
    }

    // Add fund_manager index
    try {
      await client.createPayloadIndex(collectionName, {
        field_name: 'fund_manager',
        field_schema: 'keyword'
      })
      console.log('   ✅ fund_manager index created')
    } catch (error: any) {
      if (error?.message?.includes('already exists')) {
        console.log('   ⏭️  fund_manager index already exists (skipping)')
      } else {
        throw error
      }
    }

    // Add fund_admin index
    try {
      await client.createPayloadIndex(collectionName, {
        field_name: 'fund_admin',
        field_schema: 'keyword'
      })
      console.log('   ✅ fund_admin index created')
    } catch (error: any) {
      if (error?.message?.includes('already exists')) {
        console.log('   ⏭️  fund_admin index already exists (skipping)')
      } else {
        throw error
      }
    }

    // Add jurisdiction index
    try {
      await client.createPayloadIndex(collectionName, {
        field_name: 'jurisdiction',
        field_schema: 'keyword'
      })
      console.log('   ✅ jurisdiction index created')
    } catch (error: any) {
      if (error?.message?.includes('already exists')) {
        console.log('   ⏭️  jurisdiction index already exists (skipping)')
      } else {
        throw error
      }
    }

    console.log('\n🎉 Missing indexes added successfully!\n')

    // Display updated collection info
    const collectionInfo = await client.getCollection(collectionName)
    console.log('📋 Updated collection info:')
    console.log(`   Name: ${collectionName}`)
    console.log(`   Points count: ${collectionInfo.points_count || 0}`)
    console.log(`   Status: ${collectionInfo.status}`)

    if (collectionInfo.payload_schema) {
      console.log('\n📊 Payload indexes:')
      const schema = collectionInfo.payload_schema as Record<string, any>
      Object.keys(schema).sort().forEach(field => {
        console.log(`   - ${field} (${schema[field].data_type})`)
      })
    }

    console.log('\n✅ Ready to use! Try filtering by law firm now.')

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

addMissingIndexes()
