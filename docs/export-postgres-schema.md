# How to Extract PostgreSQL Database Schema

This guide shows different methods to export your PostgreSQL database structure (schema) without data.

---

## Method 1: Using pg_dump (Recommended)

### Export Schema Only (No Data)

```bash
# Basic schema export
pg_dump -U username -d database_name --schema-only > schema.sql

# With more details
pg_dump -U username -d database_name \
  --schema-only \
  --no-owner \
  --no-privileges \
  > schema.sql
```

**Parameters:**
- `-U username` - Database user
- `-d database_name` - Database name
- `--schema-only` - Export structure only (no data)
- `--no-owner` - Don't include ownership commands
- `--no-privileges` - Don't include GRANT/REVOKE commands

### Export Schema with Connection String

```bash
# Using connection URL
pg_dump "postgresql://username:password@localhost:5432/database_name" \
  --schema-only > schema.sql

# Using environment variable
export DATABASE_URL="postgresql://username:password@localhost:5432/database_name"
pg_dump $DATABASE_URL --schema-only > schema.sql
```

### Export Schema for Specific Tables

```bash
# Single table
pg_dump -U username -d database_name \
  --schema-only \
  --table=posts > posts_schema.sql

# Multiple tables
pg_dump -U username -d database_name \
  --schema-only \
  --table=posts \
  --table=users \
  --table=paths > selected_tables.sql
```

### Export Schema in Different Formats

```bash
# Plain SQL (default)
pg_dump -U username -d database_name --schema-only > schema.sql

# Custom format (compressed, for pg_restore)
pg_dump -U username -d database_name \
  --schema-only \
  --format=custom > schema.dump

# Directory format (one file per table)
pg_dump -U username -d database_name \
  --schema-only \
  --format=directory \
  --file=schema_dir
```

### Export with Clean Statements

```bash
# Include DROP statements before CREATE
pg_dump -U username -d database_name \
  --schema-only \
  --clean > schema.sql

# This generates:
# DROP TABLE IF EXISTS posts;
# CREATE TABLE posts (...);
```

---

## Method 2: Using psql Commands

### Interactive SQL Commands

```bash
# Connect to database
psql -U username -d database_name

# Then run these commands:
```

#### List All Tables

```sql
-- List all tables in public schema
\dt

-- List all tables with details
\dt+

-- List tables in all schemas
\dt *.*
```

#### Get CREATE TABLE for Specific Table

```sql
-- Show table structure
\d posts

-- Show detailed table info
\d+ posts
```

#### Export All Table Definitions

```sql
-- Get CREATE TABLE statements for all tables
SELECT 'CREATE TABLE ' || tablename || ' (' ||
       string_agg(column_name || ' ' || data_type, ', ') || ');'
FROM information_schema.columns
WHERE table_schema = 'public'
GROUP BY tablename;
```

#### Get Complete DDL Using pg_dump Inside psql

```bash
# From command line, pipe to file
psql -U username -d database_name -c "\
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema='public'" \
| xargs -I {} pg_dump -U username -d database_name --schema-only --table={} \
> schema.sql
```

---

## Method 3: Query Information Schema

### Complete Schema Export Query

```sql
-- Save this as extract_schema.sql and run: psql -f extract_schema.sql

-- ============================================
-- TABLES
-- ============================================

SELECT
  'CREATE TABLE ' || table_name || ' (' || E'\n' ||
  string_agg(
    '  ' || column_name || ' ' ||
    CASE
      WHEN data_type = 'character varying' THEN 'VARCHAR(' || character_maximum_length || ')'
      WHEN data_type = 'character' THEN 'CHAR(' || character_maximum_length || ')'
      WHEN data_type = 'numeric' THEN 'NUMERIC(' || numeric_precision || ',' || numeric_scale || ')'
      ELSE UPPER(data_type)
    END ||
    CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
    CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END,
    ',' || E'\n'
  ) || E'\n' || ');' || E'\n\n' as create_statement
FROM information_schema.columns
WHERE table_schema = 'public'
GROUP BY table_name
ORDER BY table_name;

-- ============================================
-- PRIMARY KEYS
-- ============================================

SELECT
  'ALTER TABLE ' || tc.table_name ||
  ' ADD CONSTRAINT ' || tc.constraint_name ||
  ' PRIMARY KEY (' || string_agg(kcu.column_name, ', ') || ');'
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_schema = 'public'
GROUP BY tc.table_name, tc.constraint_name;

-- ============================================
-- FOREIGN KEYS
-- ============================================

SELECT
  'ALTER TABLE ' || tc.table_name ||
  ' ADD CONSTRAINT ' || tc.constraint_name ||
  ' FOREIGN KEY (' || kcu.column_name || ')' ||
  ' REFERENCES ' || ccu.table_name || '(' || ccu.column_name || ')' ||
  CASE
    WHEN rc.delete_rule != 'NO ACTION' THEN ' ON DELETE ' || rc.delete_rule
    ELSE ''
  END || ';'
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public';

-- ============================================
-- INDEXES
-- ============================================

SELECT
  'CREATE ' ||
  CASE WHEN i.indisunique THEN 'UNIQUE ' ELSE '' END ||
  'INDEX ' || ic.relname ||
  ' ON ' || t.relname ||
  ' (' || string_agg(a.attname, ', ') || ');'
FROM pg_index i
JOIN pg_class t ON t.oid = i.indrelid
JOIN pg_class ic ON ic.oid = i.indexrelid
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
WHERE t.relkind = 'r'
  AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  AND ic.relname NOT LIKE '%_pkey'  -- Exclude primary key indexes
GROUP BY ic.relname, t.relname, i.indisunique
ORDER BY t.relname, ic.relname;

-- ============================================
-- SEQUENCES
-- ============================================

SELECT
  'CREATE SEQUENCE ' || sequencename || ';'
FROM pg_sequences
WHERE schemaname = 'public';

-- ============================================
-- VIEWS
-- ============================================

SELECT
  'CREATE VIEW ' || table_name || ' AS ' || view_definition || ';'
FROM information_schema.views
WHERE table_schema = 'public';
```

### Simplified Table Structure Query

```sql
-- Quick table overview
SELECT
  table_name,
  column_name,
  data_type,
  character_maximum_length,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```

---

## Method 4: Using Node.js / JavaScript

### Using pg Package

```javascript
// export-schema.js
import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function exportSchema() {
  try {
    // Get all tables
    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    let schema = '-- PostgreSQL Schema Export\n\n';

    // For each table, get its definition
    for (const row of tablesResult.rows) {
      const tableName = row.table_name;

      // Get columns
      const columnsResult = await pool.query(`
        SELECT
          column_name,
          data_type,
          character_maximum_length,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);

      schema += `CREATE TABLE ${tableName} (\n`;

      const columns = columnsResult.rows.map(col => {
        let def = `  ${col.column_name} ${col.data_type}`;

        if (col.character_maximum_length) {
          def += `(${col.character_maximum_length})`;
        }

        if (col.is_nullable === 'NO') {
          def += ' NOT NULL';
        }

        if (col.column_default) {
          def += ` DEFAULT ${col.column_default}`;
        }

        return def;
      });

      schema += columns.join(',\n');
      schema += '\n);\n\n';
    }

    // Write to file
    fs.writeFileSync('schema.sql', schema);
    console.log('✅ Schema exported to schema.sql');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

exportSchema();
```

**Run it:**
```bash
export DATABASE_URL="postgresql://user:password@localhost:5432/dbname"
node export-schema.js
```

---

## Method 5: Using GUI Tools

### pgAdmin

1. Right-click on database → **Backup**
2. Select Format: **Plain**
3. Under **Dump Options** → **Data/Objects**:
   - Check **Only schema**
   - Uncheck **Only data**
4. Click **Backup**

### DBeaver

1. Right-click on database → **Tools** → **Dump Database**
2. Select **Schema only**
3. Choose output file
4. Click **Start**

### DataGrip (JetBrains)

1. Right-click on database → **SQL Scripts** → **SQL Generator**
2. Select all tables
3. Check **Create table**
4. Uncheck **Insert data**
5. Click **Copy to Clipboard** or **Save to File**

---

## Method 6: Docker/Docker Compose

### If Using Docker

```bash
# Get container ID
docker ps

# Export schema from container
docker exec -t container_name pg_dump \
  -U username \
  -d database_name \
  --schema-only > schema.sql

# Or with docker-compose
docker-compose exec postgres pg_dump \
  -U username \
  -d database_name \
  --schema-only > schema.sql
```

---

## Practical Examples

### Your SvelteKit Blog Project

Based on your project structure, here's how to export:

```bash
# If using local PostgreSQL
pg_dump -U your_username -d blog_db --schema-only > schema.sql

# If using connection string from .env
export DATABASE_URL="postgresql://user:pass@localhost:5432/blog_db"
pg_dump $DATABASE_URL --schema-only > init-scripts/01-schema.sql

# Export only specific tables
pg_dump $DATABASE_URL \
  --schema-only \
  --table=users \
  --table=posts \
  --table=paths \
  --table=tags \
  --table=post_tags > core-schema.sql

# Export with clean statements (drop existing)
pg_dump $DATABASE_URL \
  --schema-only \
  --clean \
  --if-exists > schema-with-drops.sql
```

### Export and Format for Documentation

```bash
# Export schema
pg_dump $DATABASE_URL --schema-only > schema.sql

# Pretty print with comments
pg_dump $DATABASE_URL \
  --schema-only \
  --verbose \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  > docs/database-schema.sql
```

### Create Script to Auto-Export

```bash
# create-schema-export.sh
#!/bin/bash

# Load environment variables
source .env

# Create exports directory
mkdir -p exports

# Export full schema
pg_dump $DATABASE_URL \
  --schema-only \
  --no-owner \
  --no-privileges \
  > exports/schema-$(date +%Y%m%d).sql

# Export tables only
pg_dump $DATABASE_URL \
  --schema-only \
  --no-owner \
  --no-privileges \
  --section=pre-data \
  > exports/tables-$(date +%Y%m%d).sql

# Export indexes only
pg_dump $DATABASE_URL \
  --schema-only \
  --section=post-data \
  > exports/indexes-$(date +%Y%m%d).sql

echo "✅ Schema exported to exports/"
```

**Make executable and run:**
```bash
chmod +x create-schema-export.sh
./create-schema-export.sh
```

---

## Comparison of Methods

| Method | Pros | Cons | Best For |
|--------|------|------|----------|
| **pg_dump** | Most complete, standard tool | Requires PostgreSQL client | Production exports |
| **psql** | Interactive exploration | Manual for large schemas | Development |
| **Information Schema** | Customizable queries | Requires SQL knowledge | Documentation |
| **Node.js** | Programmable, automated | Requires code | CI/CD pipelines |
| **GUI Tools** | User-friendly | Not scriptable | One-time exports |
| **Docker** | Works with containers | Container-specific | Containerized apps |

---

## Common Options Reference

### pg_dump Schema Options

```bash
--schema-only           # Export structure only (no data)
--data-only            # Export data only (no structure)
--clean                # Add DROP statements
--if-exists            # Use IF EXISTS with DROP
--no-owner             # Don't include ownership
--no-privileges        # Don't include GRANT/REVOKE
--table=TABLE          # Export specific table
--exclude-table=TABLE  # Exclude specific table
--schema=SCHEMA        # Export specific schema
--format=FORMAT        # Output format (plain, custom, directory, tar)
--file=FILE            # Output to file
--verbose              # Show detailed progress
--inserts              # Use INSERT commands (not COPY)
```

### pg_dump Format Options

```bash
-F p   # Plain SQL (default)
-F c   # Custom (compressed)
-F d   # Directory (one file per table)
-F t   # Tar archive
```

---

## Troubleshooting

### Permission Denied

```bash
# Add password
PGPASSWORD=your_password pg_dump -U username -d database --schema-only > schema.sql

# Or use .pgpass file
echo "localhost:5432:database:username:password" > ~/.pgpass
chmod 600 ~/.pgpass
```

### Connection Issues

```bash
# Specify host and port
pg_dump -h localhost -p 5432 -U username -d database --schema-only > schema.sql

# Test connection first
psql -h localhost -p 5432 -U username -d database -c "SELECT version();"
```

### Large Schemas

```bash
# Compress output
pg_dump $DATABASE_URL --schema-only | gzip > schema.sql.gz

# Split by section
pg_dump $DATABASE_URL --schema-only --section=pre-data > tables.sql
pg_dump $DATABASE_URL --schema-only --section=post-data > indexes.sql
```

### Export Specific Schema (not public)

```bash
# Export 'myapp' schema instead of 'public'
pg_dump -U username -d database --schema=myapp --schema-only > schema.sql
```

---

## Best Practices

1. **Version Control**: Commit schema exports to git
   ```bash
   pg_dump $DATABASE_URL --schema-only > init-scripts/schema.sql
   git add init-scripts/schema.sql
   git commit -m "Update database schema"
   ```

2. **Regular Backups**: Schedule exports
   ```bash
   # Add to crontab
   0 2 * * * pg_dump $DATABASE_URL --schema-only > /backups/schema-$(date +\%Y\%m\%d).sql
   ```

3. **Documentation**: Keep schema docs updated
   ```bash
   pg_dump $DATABASE_URL --schema-only > docs/current-schema.sql
   ```

4. **CI/CD Integration**: Export in pipeline
   ```yaml
   # .github/workflows/export-schema.yml
   - name: Export schema
     run: |
       pg_dump $DATABASE_URL --schema-only > schema.sql
       git add schema.sql
   ```

---

## Next Steps

After exporting your schema:

1. **Review** - Check the exported file for accuracy
2. **Document** - Add comments to explain complex structures
3. **Version Control** - Commit to git
4. **Migration** - Use for database migrations
5. **Restore** - Test restore on a fresh database

```bash
# Test restore
createdb test_db
psql -d test_db -f schema.sql
```
