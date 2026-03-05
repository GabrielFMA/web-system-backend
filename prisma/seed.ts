import { PrismaClient, PermissionEffect } from '@prisma/client'
import { randomUUID } from 'crypto'
import * as bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  const permission = await prisma.permission.create({
    data: {
      code: '010001'
    }
  })

  const group = await prisma.group.create({
    data: {
      enrollment: 'admin',
      title: 'Administrador'
    }
  })

  await prisma.groupPermission.create({
    data: {
      groupId: group.id,
      permissionId: permission.id
    }
  })

  const hashed = await bcrypt.hash('admin123', 10)

  const user = await prisma.user.create({
    data: {
      uid: randomUUID(),
      enrollment: 'admin',
      name: 'Admin',
      email: 'admin@admin.com',
      password: hashed
    }
  })

  await prisma.userMeta.create({
    data: {
      userId: user.id
    }
  })

  await prisma.userGroup.create({
    data: {
      userId: user.id,
      groupId: group.id
    }
  })

  console.log('✅ Admin criado com sucesso')
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })