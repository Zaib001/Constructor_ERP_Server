-- SQL to add deleted_at to all tables in auth schema if missing
DO $$ 
DECLARE 
    t TEXT;
    tables TEXT[] := ARRAY[
        'auth.companies',
        'auth.roles',
        'auth.departments',
        'auth.users',
        'auth.projects',
        'auth.approval_requests',
        'auth.approval_steps',
        'auth.vendors',
        'auth.purchase_orders',
        'auth.payrolls',
        'auth.quotations',
        'auth.expenses',
        'auth.wbs',
        'auth.cost_codes',
        'auth.items',
        'auth.employees',
        'auth.vehicles',
        'auth.equipment',
        'auth.company_documents',
        'auth.facility_documents',
        'auth.stocks',
        'auth.purchase_requests',
        'auth.excess_materials'
    ];
BEGIN 
    FOREACH t IN ARRAY tables LOOP
        DECLARE
            schema_name TEXT := split_part(t, '.', 1);
            table_name TEXT := split_part(t, '.', 2);
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = schema_name 
                AND table_name = table_name 
                AND column_name = 'deleted_at'
            ) THEN
                EXECUTE 'ALTER TABLE ' || t || ' ADD COLUMN deleted_at TIMESTAMP(6)';
                RAISE NOTICE 'Added deleted_at to %', t;
            ELSE
                RAISE NOTICE 'Table % already has deleted_at', t;
            END IF;
        END;
    END LOOP;
END $$;
