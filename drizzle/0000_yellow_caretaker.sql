CREATE TABLE "conversation_state" (
	"vendor_id" integer NOT NULL,
	"phone_number" varchar(20) NOT NULL,
	"step" varchar(30) DEFAULT 'idle' NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_state_vendor_id_phone_number_pk" PRIMARY KEY("vendor_id","phone_number")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_id" integer NOT NULL,
	"phone_number" varchar(20) NOT NULL,
	"name" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_vendor_id_phone_number_unique" UNIQUE("vendor_id","phone_number")
);
--> statement-breakpoint
CREATE TABLE "faqs" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_id" integer NOT NULL,
	"keywords" text[] NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"category" varchar(20) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_kobo" integer NOT NULL,
	"prep_minutes" integer NOT NULL,
	"image_url" text,
	"is_available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"menu_item_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_kobo" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'cart' NOT NULL,
	"total_kobo" integer DEFAULT 0 NOT NULL,
	"paystack_reference" varchar(100),
	"estimated_ready_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_state" (
	"phone_number" varchar(20) PRIMARY KEY NOT NULL,
	"step" varchar(30) DEFAULT 'idle' NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_messages" (
	"message_id" varchar(100) PRIMARY KEY NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(60) NOT NULL,
	"business_name" varchar(120) NOT NULL,
	"admin_phone" varchar(20) NOT NULL,
	"currency" varchar(3) DEFAULT 'NGN' NOT NULL,
	"timezone" varchar(60) DEFAULT 'Africa/Lagos' NOT NULL,
	"whatsapp_phone_number_id" varchar(60),
	"whatsapp_token" text,
	"paystack_secret_key" text,
	"greeting_message" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendors_slug_unique" UNIQUE("slug"),
	CONSTRAINT "vendors_admin_phone_unique" UNIQUE("admin_phone"),
	CONSTRAINT "vendors_whatsapp_phone_number_id_unique" UNIQUE("whatsapp_phone_number_id")
);
--> statement-breakpoint
ALTER TABLE "conversation_state" ADD CONSTRAINT "conversation_state_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;