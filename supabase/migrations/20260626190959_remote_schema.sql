


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."delete_user_account"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  -- delete the user running this function from the auth.users table
  delete from auth.users where id = auth.uid();
end;
$$;


ALTER FUNCTION "public"."delete_user_account"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_times"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
    BEGIN
    IF (TG_OP = 'INSERT') THEN
        NEW.created_at := now();
        NEW.updated_at := now();
    ELSEIF (TG_OP = 'UPDATE') THEN
        NEW.created_at = OLD.created_at;
        NEW.updated_at = now();
    END IF;
    RETURN NEW;
    END;
    $$;


ALTER FUNCTION "public"."handle_times"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."recipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "image" "text" DEFAULT ''::"text" NOT NULL,
    "prep_time" "text" DEFAULT ''::"text" NOT NULL,
    "difficulty" "text" DEFAULT ''::"text" NOT NULL,
    "category" "text" DEFAULT ''::"text" NOT NULL,
    "servings" "text" DEFAULT ''::"text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "ingredients" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "instructions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_public" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "is_deleted" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."recipes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."recipes"."is_deleted" IS 'Used for soft-deleting recipes';



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_pkey" PRIMARY KEY ("id");



CREATE INDEX "recipes_updated_at_idx" ON "public"."recipes" USING "btree" ("updated_at");



CREATE OR REPLACE TRIGGER "handle_times" BEFORE INSERT OR UPDATE ON "public"."recipes" FOR EACH ROW EXECUTE FUNCTION "public"."handle_times"();



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Anyone can view public recipes" ON "public"."recipes" FOR SELECT USING (("is_public" = true));



CREATE POLICY "Users can create and manage their own private recipes" ON "public"."recipes" TO "authenticated" USING (true) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."recipes" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."recipes";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";





































































































































































GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."recipes" TO "anon";
GRANT ALL ON TABLE "public"."recipes" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."recipes" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";































drop extension if exists "pg_net";

revoke delete on table "public"."recipes" from "anon";

revoke insert on table "public"."recipes" from "anon";

revoke select on table "public"."recipes" from "anon";

revoke update on table "public"."recipes" from "anon";

revoke delete on table "public"."recipes" from "service_role";

revoke insert on table "public"."recipes" from "service_role";

revoke select on table "public"."recipes" from "service_role";

revoke update on table "public"."recipes" from "service_role";


