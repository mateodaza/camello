-- Unique index on (channel_type, phone_number) to prevent cross-tenant
-- misrouting of WhatsApp messages. Guarantees no two tenants claim the
-- same phone_number_id for the same channel type.
CREATE UNIQUE INDEX channel_configs_type_phone_unique_idx
  ON channel_configs (channel_type, phone_number)
  WHERE phone_number IS NOT NULL;
