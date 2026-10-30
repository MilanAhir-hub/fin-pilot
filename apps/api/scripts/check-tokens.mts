import mongoose from 'mongoose';

async function main() {
  await mongoose.connect('mongodb://127.0.0.1:27017/finpilot');
  const user = await mongoose.connection.db!.collection('users').findOne({ email: 'owner@finpilot.demo' });
  const companies = await mongoose.connection.db!.collection('companies').find({}).toArray();
  for (const c of companies) {
    const org = await mongoose.connection.db!.collection('organizations').findOne({ _id: c.organizationId });
    const invCount = await mongoose.connection.db!.collection('invoices').countDocuments({ companyId: c._id });
    const docCount = await mongoose.connection.db!.collection('documents').countDocuments({ companyId: c._id });
    console.log(c._id.toString(), c.legalName, 'Invoices:', invCount, 'Docs:', docCount, 'Plan:', org?.plan);
  }
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
