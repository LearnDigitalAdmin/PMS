// Firebase Admin SDK Script to Bulk Upload Plans
// Run this with: node uploadPlans.js

const admin = require('firebase-admin');

// Initialize Firebase Admin
// Make sure you have your serviceAccountKey.json file
const serviceAccount = require('./SSKEY.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Plan configurations
const plansConfig = [
  {
    name: 'free',
    displayName: 'Free Forever',
    monthlyPrice: 0,
    properties: 1,
    tenants: 5,
    sync: false,
    features: [
      '1 Property',
      'Up to 5 Tenants',
      'Invoice Generation',
      'Local Storage Only',
      'WhatsApp/Email Sharing',
      'Heavy PlotYangu Branding'
    ]
  },
  {
    name: 'starter',
    displayName: 'Starter',
    monthlyPrice: 700,
    properties: 3,
    tenants: 30,
    sync: false,
    features: [
      'Up to 3 Properties',
      'Up to 30 Tenants',
      'Invoice Generation',
      'Local Storage',
      'WhatsApp/Email Sharing',
      'Light Footer Branding',
      'Basic Reports'
    ]
  },
  {
    name: 'solo',
    displayName: 'Solo Property Enterprise',
    monthlyPrice: 1199,
    properties: 1,
    tenants: 20,
    sync: true,
    features: [
      '1 Property',
      'Up to 20 Tenants',
      'Invoice Generation',
      'Automated WhatsApp Notifications',
      'Multi-device Cloud Sync'
    ]
  },
  {
    name: 'business',
    displayName: 'Business',
    monthlyPrice: 1900,
    properties: 9,
    tenants: 126,
    sync: true,
    features: [
      'Up to 9 Properties',
      'Up to 126 Tenants',
      'Multi-device Cloud Sync',
      'Custom Logo/Branding',
      'Excel/PDF Export',
      'Priority Support',
      'Arrears Tracking'
    ]
  },
  {
    name: 'pro',
    displayName: 'Professional',
    monthlyPrice: 3400,
    properties: 16,
    tenants: 300,
    sync: true,
    features: [
      'Up to 16 Properties',
      'Up to 300 Tenants',
      'Invoice Generation',
      'Automated WhatsApp Notifications',
      'Multi-device Cloud Sync',
      'Custom Logo/Branding',
      'Advanced Reports',
      'Excel/PDF Export',
      'Priority Support',
      'Arrears Tracking'
    ]
  },
  {
    name: 'enterprise',
    displayName: 'Enterprise',
    monthlyPrice: 5600,
    properties: 999999, // Represents unlimited
    tenants: 999999, // Represents unlimited
    sync: true,
    features: [
      'Unlimited Properties',
      'Unlimited Tenants',
      'Full White-label Invoices',
      'Automated WhatsApp Notifications',
      'Automated SMS Notifications (Coming on Jan 2026)',
      'Multi-device + Team Access',
      'Bulk Invoice Sending',
      'Advanced Analytics',
      'M-Pesa Integration Ready',
      'Dedicated Support',
      'Custom Integrations'
    ]
  }
];

async function uploadPlans() {
  console.log('🚀 Starting bulk upload of plans to Firestore...\n');

  const batch = db.batch();
  let count = 0;

  for (const plan of plansConfig) {
    // Skip free plan for paid subscriptions (no monthly/annual variants)
    if (plan.name === 'free') {
      const freeRef = db.collection('plans').doc('free');
      batch.set(freeRef, {
        name: plan.name,
        displayName: plan.displayName,
        price: 0,
        type: 'free',
        properties: plan.properties,
        tenants: plan.tenants,
        sync: plan.sync,
        features: plan.features
      });
      count++;
      console.log(`✅ Added: free`);
      continue;
    }

    // Create monthly variant
    const monthlyRef = db.collection('plans').doc(`${plan.name}_monthly`);
    batch.set(monthlyRef, {
      name: plan.name,
      displayName: plan.displayName,
      price: plan.monthlyPrice,
      type: 'monthly',
      properties: plan.properties,
      tenants: plan.tenants,
      sync: plan.sync,
      features: plan.features
    });
    count++;
    console.log(`✅ Added: ${plan.name}_monthly (KES ${plan.monthlyPrice})`);

    // Create annual variant (10 months worth)
    const annualPrice = plan.monthlyPrice * 10;
    const annualRef = db.collection('plans').doc(`${plan.name}_annual`);
    batch.set(annualRef, {
      name: plan.name,
      displayName: plan.displayName,
      price: annualPrice,
      type: 'annual',
      properties: plan.properties,
      tenants: plan.tenants,
      sync: plan.sync,
      features: plan.features
    });
    count++;
    console.log(`✅ Added: ${plan.name}_annual (KES ${annualPrice})`);
  }

  // Commit the batch
  await batch.commit();
  
  console.log(`\n🎉 Successfully uploaded ${count} plans to Firestore!`);
  console.log('\n📋 Summary:');
  console.log('- free (1 document)');
  console.log('- starter_monthly & starter_annual');
  console.log('- solo_monthly & solo_annual');
  console.log('- business_monthly & business_annual');
  console.log('- pro_monthly & pro_annual');
  console.log('- enterprise_monthly & enterprise_annual');
  
  process.exit(0);
}

// Run the upload
uploadPlans().catch((error) => {
  console.error('❌ Error uploading plans:', error);
  process.exit(1);
});