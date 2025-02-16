import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import postgres from 'postgres';
import { fileURLToPath } from 'url';
import { POSTGRES } from '../app/helpers/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database connection
const sql = postgres(`postgresql://${POSTGRES.postgresUsername}:${POSTGRES.postgresPassword}@${POSTGRES.postgresURL}:${POSTGRES.postgresPort}/${POSTGRES.postgresDatabase}`);

async function calculateChecksum(filePath) {
    const fileContent = await fs.promises.readFile(filePath, 'utf8');
    return crypto.createHash('sha256').update(fileContent).digest('hex');
}

async function getAppliedMigrations() {
    try {
        const result = await sql`
            SELECT version, checksum
            FROM schema_version
            ORDER BY installed_on ASC
        `;
        return result;
    } catch (error) {
        if (error.code === '42P01') { // Table doesn't exist
            return [];
        }
        throw error;
    }
}

async function markMigrationAsApplied(version, description, script, checksum, executionTime, success) {
    await sql`
        INSERT INTO schema_version (
            version,
            description,
            type,
            script,
            checksum,
            installed_by,
            execution_time,
            success
        ) VALUES (
            ${version},
            ${description},
            ${'SQL'},
            ${script},
            ${checksum},
            ${POSTGRES.postgresUsername},
            ${executionTime},
            ${success}
        )
    `;
}

async function executeMigration(filePath) {
    const content = await fs.promises.readFile(filePath, 'utf8');
    const startTime = Date.now();
    
    try {
        await sql.begin(async (sql) => {
            await sql.unsafe(content);
        });
        
        const executionTime = Date.now() - startTime;
        return { success: true, executionTime };
    } catch (error) {
        console.error(`Error executing migration ${filePath}:`, error);
        return { success: false, executionTime: Date.now() - startTime };
    }
}

async function migrate() {
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = await fs.promises.readdir(migrationsDir);
    
    // Get all SQL migration files and sort them by version
    const migrationFiles = files
        .filter(file => file.endsWith('.sql'))
        .sort((a, b) => {
            const versionA = parseInt(a.match(/V(\d+)__/)[1]);
            const versionB = parseInt(b.match(/V(\d+)__/)[1]);
            return versionA - versionB;
        });

    const appliedMigrations = await getAppliedMigrations();
    
    for (const file of migrationFiles) {
        const filePath = path.join(migrationsDir, file);
        const version = file.match(/V(\d+)__/)[1];
        const description = file.match(/V\d+__(.+)\.sql/)[1].replace(/_/g, ' ');
        
        const appliedMigration = appliedMigrations.find(m => m.version === version);
        const currentChecksum = await calculateChecksum(filePath);
        
        if (appliedMigration) {
            if (appliedMigration.checksum !== currentChecksum) {
                throw new Error(`Checksum mismatch for migration ${file}. The migration file has been modified after it was applied.`);
            }
            console.log(`Migration ${file} already applied, skipping...`);
            continue;
        }

        console.log(`Executing migration ${file}...`);
        const { success, executionTime } = await executeMigration(filePath);
        
        if (success) {
            await markMigrationAsApplied(
                version,
                description,
                file,
                currentChecksum,
                executionTime,
                success
            );
            console.log(`Successfully applied migration ${file}`);
        } else {
            throw new Error(`Failed to apply migration ${file}`);
        }
    }
}

// Run migrations
migrate()
    .then(() => {
        console.log('All migrations completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
    });
