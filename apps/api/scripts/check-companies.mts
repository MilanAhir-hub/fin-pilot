import mongoose from 'mongoose';

async function main() {
  await mongoose.connect('mongodb://127.0.0.1:27017/finpilot');
  const allConvs = await mongoose.connection.db!.collection('aiconversations').find({}).toArray();
  console.log('Total aiconversations:', allConvs.length);
  const byCompany: Record<string, number> = {};
  for (const c of allConvs) {
    const cid = String(c.companyId);
    byCompany[cid] = (byCompany[cid] || 0) + 1;
  }
  for (const [cid, count] of Object.entries(byCompany)) {
    const comp = await mongoose.connection.db!.collection('companies').findOne({ _id: new mongoose.Types.ObjectId(cid) });
    const org = comp ? await mongoose.connection.db!.collection('organizations').findOne({ _id: comp.organizationId }) : null;
    const usages = await mongoose.connection.db!.collection('aiusages').find({ companyId: new mongoose.Types.ObjectId(cid) }).toArray();
    console.log(`Company: ${comp?.legalName ?? 'unknown'} (${cid}) -> Org: ${org?.name ?? 'unknown'} -> Convs: ${count} -> Usages: ${JSON.stringify(usages)}`);
  }
  process.exit(0);
}
main();
