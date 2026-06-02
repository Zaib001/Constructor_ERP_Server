require('dotenv').config();
const bcrypt = require('bcrypt');
const prisma = require('../src/db');

async function main() {
  const email = 'engineer@constructionerp.com';
  const password = 'Password123!';
  console.log(`Hashing password for ${email}...`);
  const passwordHash = await bcrypt.hash(password, 10);
  
  await prisma.user.update({
    where: { email },
    data: { password_hash: passwordHash }
  });
  
  console.log(`Password updated successfully!`);
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
