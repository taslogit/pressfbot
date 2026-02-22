// Database migrations for Press F
const { Pool } = require('pg');
const logger = require('./utils/logger');

const createTables = async (pool) => {
  try {
    // Letters table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS letters (
        id VARCHAR(255) PRIMARY KEY,
        user_id BIGINT NOT NULL,
        title VARCHAR(500) NOT NULL,
        content TEXT,
        encrypted_content TEXT,
        ipfs_hash VARCHAR(255),
        recipients TEXT[],
        unlock_date TIMESTAMP,
        status VARCHAR(50) DEFAULT 'draft',
        letter_type VARCHAR(50),
        attachments TEXT[],
        options JSONB,
        is_favorite BOOLEAN DEFAULT false,
        unlock_notified_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_letters_user_id ON letters(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_letters_status ON letters(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_letters_unlock_date ON letters(unlock_date)`);
    await pool.query(`ALTER TABLE letters ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE letters ADD COLUMN IF NOT EXISTS unlock_notified_at TIMESTAMP`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_letters_favorite ON letters(is_favorite)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_letters_unlock_notified ON letters(unlock_notified_at)`);
    // Performance: Composite indexes for common query patterns
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_letters_user_status_created ON letters(user_id, status, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_letters_user_favorite ON letters(user_id, is_favorite) WHERE is_favorite = true`);
    
    // Full-text search indexes (GIN for text search)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_letters_title_gin ON letters USING gin(to_tsvector('russian', title))`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_letters_content_gin ON letters USING gin(to_tsvector('russian', COALESCE(content, '')))`);

    // Duels table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS duels (
        id VARCHAR(255) PRIMARY KEY,
        challenger_id BIGINT NOT NULL,
        opponent_id BIGINT,
        opponent_name VARCHAR(255),
        title VARCHAR(500) NOT NULL,
        stake VARCHAR(255),
        deadline TIMESTAMP NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        is_public BOOLEAN DEFAULT false,
        is_team BOOLEAN DEFAULT false,
        witness_count INTEGER DEFAULT 0,
        loser_id BIGINT,
        is_favorite BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      )
    `);
    await pool.query(`ALTER TABLE duels ADD COLUMN IF NOT EXISTS opponent_name VARCHAR(255)`);
    await pool.query(`ALTER TABLE duels ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false`);
    // Gamification: Hype system for public duels
    await pool.query(`ALTER TABLE duels ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE duels ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMP`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_duels_challenger ON duels(challenger_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_duels_opponent ON duels(opponent_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_duels_status ON duels(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_duels_favorite ON duels(is_favorite)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_duels_public_views ON duels(is_public, views_count DESC) WHERE is_public = true`);
    // Performance: Composite indexes for common query patterns
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_duels_challenger_status ON duels(challenger_id, status, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_duels_opponent_status ON duels(opponent_id, status, created_at DESC)`);
    
    // Full-text search indexes for duels
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_duels_title_gin ON duels USING gin(to_tsvector('russian', title))`);

    // Legacy items table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS legacy_items (
        id VARCHAR(255) PRIMARY KEY,
        user_id BIGINT NOT NULL,
        item_type VARCHAR(50) NOT NULL,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        encrypted_payload TEXT,
        severity INTEGER,
        rarity VARCHAR(50),
        is_resolved BOOLEAN DEFAULT false,
        ghost_config JSONB,
        is_favorite BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_legacy_user_id ON legacy_items(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_legacy_type ON legacy_items(item_type)`);
    await pool.query(`ALTER TABLE legacy_items ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_legacy_favorite ON legacy_items(is_favorite)`);

    // Letter versions table (history)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS letter_versions (
        id UUID PRIMARY KEY,
        letter_id VARCHAR(255) NOT NULL,
        user_id BIGINT NOT NULL,
        title VARCHAR(500) NOT NULL,
        content TEXT,
        recipients TEXT[],
        unlock_date TIMESTAMP,
        status VARCHAR(50),
        letter_type VARCHAR(50),
        attachments TEXT[],
        options JSONB,
        created_at TIMESTAMP DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_letter_versions_letter_id ON letter_versions(letter_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_letter_versions_user_id ON letter_versions(user_id)`);

    // Profiles table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        user_id BIGINT PRIMARY KEY,
        avatar VARCHAR(255),
        bio TEXT,
        level INTEGER DEFAULT 1,
        title VARCHAR(255),
        reputation INTEGER DEFAULT 0,
        karma INTEGER DEFAULT 50,
        stats JSONB DEFAULT '{"beefsWon": 0, "leaksDropped": 0, "daysAlive": 1}',
        gifts JSONB DEFAULT '[]',
        achievements JSONB DEFAULT '[]',
        perks JSONB DEFAULT '[]',
        contracts JSONB DEFAULT '[]',
        ton_address VARCHAR(255),
        experience INTEGER DEFAULT 0,
        total_xp_earned INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      )
    `);
    await pool.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ton_address VARCHAR(255)`);
    // Gamification: Experience and Levels
    await pool.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS experience INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_xp_earned INTEGER DEFAULT 0`);
    // Gamification: Referral System
    await pool.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE`);
    await pool.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by BIGINT`);
    await pool.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referrals_count INTEGER DEFAULT 0`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON profiles(referral_code)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON profiles(referred_by)`);
    
    // Add CHECK constraints for data integrity
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'check_profiles_reputation_non_negative'
        ) THEN
          ALTER TABLE profiles ADD CONSTRAINT check_profiles_reputation_non_negative 
            CHECK (reputation >= 0);
        END IF;
      END $$;
    `);
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'check_profiles_experience_non_negative'
        ) THEN
          ALTER TABLE profiles ADD CONSTRAINT check_profiles_experience_non_negative 
            CHECK (experience >= 0);
        END IF;
      END $$;
    `);
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'check_profiles_total_xp_non_negative'
        ) THEN
          ALTER TABLE profiles ADD CONSTRAINT check_profiles_total_xp_non_negative 
            CHECK (total_xp_earned >= 0);
        END IF;
      END $$;
    `);
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'check_profiles_karma_range'
        ) THEN
          ALTER TABLE profiles ADD CONSTRAINT check_profiles_karma_range 
            CHECK (karma >= 0 AND karma <= 100);
        END IF;
      END $$;
    `);
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'check_profiles_level_positive'
        ) THEN
          ALTER TABLE profiles ADD CONSTRAINT check_profiles_level_positive 
            CHECK (level > 0);
        END IF;
      END $$;
    `);

    // TON inheritance plans
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ton_inheritance_plans (
        id UUID PRIMARY KEY,
        user_id BIGINT NOT NULL,
        recipients JSONB NOT NULL,
        token_symbol VARCHAR(50) NOT NULL,
        total_amount NUMERIC(20, 9) NOT NULL,
        trigger_type VARCHAR(50) DEFAULT 'deadman',
        status VARCHAR(50) DEFAULT 'draft',
        tx_hash VARCHAR(255),
        created_at TIMESTAMP DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ton_inheritance_user_id ON ton_inheritance_plans(user_id)`);

    // TON storage plans
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ton_storage_plans (
        id UUID PRIMARY KEY,
        user_id BIGINT NOT NULL,
        letter_id VARCHAR(255),
        storage_provider VARCHAR(50) NOT NULL,
        plan_type VARCHAR(50) DEFAULT 'permanent',
        size_bytes BIGINT,
        status VARCHAR(50) DEFAULT 'pending',
        tx_hash VARCHAR(255),
        created_at TIMESTAMP DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ton_storage_user_id ON ton_storage_plans(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ton_storage_letter_id ON ton_storage_plans(letter_id)`);

    // TON duel escrows
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ton_duel_escrows (
        id UUID PRIMARY KEY,
        duel_id VARCHAR(255) NOT NULL,
        user_id BIGINT NOT NULL,
        challenger_address VARCHAR(255) NOT NULL,
        opponent_address VARCHAR(255),
        token_symbol VARCHAR(50) NOT NULL,
        stake_amount NUMERIC(20, 9) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        tx_hash VARCHAR(255),
        created_at TIMESTAMP DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ton_duel_id ON ton_duel_escrows(duel_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ton_duel_user_id ON ton_duel_escrows(user_id)`);

    // User settings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id BIGINT PRIMARY KEY,
        dead_man_switch_days INTEGER DEFAULT 30,
        last_check_in TIMESTAMP DEFAULT now(),
        last_daily_claim TIMESTAMP,
        funeral_track VARCHAR(255) DEFAULT 'astronomia',
        language VARCHAR(10) DEFAULT 'en',
        theme VARCHAR(10) DEFAULT 'dark',
        sound_enabled BOOLEAN DEFAULT true,
        checkin_notified_at TIMESTAMP,
        notifications_enabled BOOLEAN DEFAULT true,
        telegram_notifications_enabled BOOLEAN DEFAULT true,
        checkin_reminder_interval_minutes INTEGER DEFAULT 60,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      )
    `);
    await pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS checkin_notified_at TIMESTAMP`);
    await pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT true`);
    await pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS telegram_notifications_enabled BOOLEAN DEFAULT true`);
    await pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS checkin_reminder_interval_minutes INTEGER DEFAULT 60`);
    // Gamification: Streaks
    await pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS longest_streak INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS last_streak_date DATE`);
    await pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS streak_free_skip INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS last_daily_login_loot DATE`);
    await pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS guide_reward_claimed BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS avatar_frame VARCHAR(50) DEFAULT 'default'`);
    await pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS free_gift_balance INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS duel_taunt_message VARCHAR(500)`);

    // Squads table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS squads (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        creator_id BIGINT NOT NULL,
        members JSONB DEFAULT '[]',
        pact_health INTEGER DEFAULT 100,
        shared_payload TEXT,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_squads_creator ON squads(creator_id)`);
    // Performance: GIN index for JSONB members queries
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_squads_members_gin ON squads USING GIN (members)`);
    await pool.query(`ALTER TABLE squads ADD COLUMN IF NOT EXISTS banner_url VARCHAR(500)`);

    // Witnesses table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS witnesses (
        id VARCHAR(255) PRIMARY KEY,
        letter_id VARCHAR(255),
        user_id BIGINT NOT NULL,
        name VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_witnesses_letter ON witnesses(letter_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_witnesses_user ON witnesses(user_id)`);

    // Old quests table removed - replaced with daily_quests table (see Daily Quests section)

    // Daily Quests table (Gamification)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS daily_quests (
        id UUID PRIMARY KEY,
        user_id BIGINT NOT NULL,
        quest_type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        target_count INTEGER DEFAULT 1,
        current_count INTEGER DEFAULT 0,
        reward INTEGER DEFAULT 10,
        quest_date DATE NOT NULL,
        is_completed BOOLEAN DEFAULT false,
        is_claimed BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_daily_quests_user_date ON daily_quests(user_id, quest_date)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_daily_quests_date ON daily_quests(quest_date)`);
    // Performance: Index for quest_type filtering
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_daily_quests_quest_type ON daily_quests(quest_type)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_daily_quests_user_type_date ON daily_quests(user_id, quest_type, quest_date)`);
    await pool.query(`ALTER TABLE daily_quests ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP`);

    // Notification events log
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_events (
        id UUID PRIMARY KEY,
        user_id BIGINT NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        title VARCHAR(255),
        message TEXT,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT now()
      )
    `);
    await pool.query(`ALTER TABLE notification_events ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notification_events(user_id)`);

    // Referral events table (Gamification)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS referral_events (
        id UUID PRIMARY KEY,
        referrer_id BIGINT NOT NULL,
        referred_id BIGINT NOT NULL,
        reward_given BOOLEAN DEFAULT false,
        reward_amount INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_referral_events_referrer ON referral_events(referrer_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_referral_events_referred ON referral_events(referred_id)`);

    // Friendships table (Bidirectional friend relationships)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS friendships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id BIGINT NOT NULL,
        friend_id BIGINT NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        requested_by BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT now(),
        accepted_at TIMESTAMP,
        UNIQUE(user_id, friend_id),
        FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE,
        FOREIGN KEY (friend_id) REFERENCES profiles(user_id) ON DELETE CASCADE
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_friendships_user_status ON friendships(user_id, status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_friendships_friend_status ON friendships(friend_id, status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_friendships_requested_by ON friendships(requested_by)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(status)`);
    // Performance: Composite index for common query pattern (user_id, friend_id, status)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_friendships_user_friend_status ON friendships(user_id, friend_id, status)`);

    // Friend groups (PHASE 5.2 - categories/organization)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS friend_groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id BIGINT NOT NULL,
        name VARCHAR(100) NOT NULL,
        color VARCHAR(20),
        icon VARCHAR(50),
        created_at TIMESTAMP DEFAULT now(),
        FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_friend_groups_user ON friend_groups(user_id)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS friend_group_members (
        group_id UUID NOT NULL,
        friend_id BIGINT NOT NULL,
        PRIMARY KEY (group_id, friend_id),
        FOREIGN KEY (group_id) REFERENCES friend_groups(id) ON DELETE CASCADE,
        FOREIGN KEY (friend_id) REFERENCES profiles(user_id) ON DELETE CASCADE
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_friend_group_members_group ON friend_group_members(group_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_friend_group_members_friend ON friend_group_members(friend_id)`);

    // Streak Challenges table (Viral mechanics - friends compete on days in a row)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS streak_challenges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        challenger_id BIGINT NOT NULL,
        opponent_id BIGINT,
        opponent_name VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        challenger_start_streak INTEGER DEFAULT 0,
        opponent_start_streak INTEGER DEFAULT 0,
        challenger_current_streak INTEGER DEFAULT 0,
        opponent_current_streak INTEGER DEFAULT 0,
        winner_id BIGINT,
        stake_type VARCHAR(50) DEFAULT 'pride',
        stake_amount INTEGER DEFAULT 0,
        reward_xp INTEGER DEFAULT 0,
        reward_rep INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT now(),
        accepted_at TIMESTAMP,
        ended_at TIMESTAMP,
        expires_at TIMESTAMP
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_streak_challenges_challenger ON streak_challenges(challenger_id, status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_streak_challenges_opponent ON streak_challenges(opponent_id, status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_streak_challenges_status ON streak_challenges(status, expires_at)`);

    // Gifts table (Gamification)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gifts (
        id UUID PRIMARY KEY,
        sender_id BIGINT NOT NULL,
        recipient_id BIGINT NOT NULL,
        gift_type VARCHAR(50) NOT NULL,
        gift_name VARCHAR(255) NOT NULL,
        gift_icon VARCHAR(10),
        rarity VARCHAR(20) DEFAULT 'common',
        cost INTEGER DEFAULT 0,
        effect JSONB,
        message TEXT,
        is_claimed BOOLEAN DEFAULT false,
        claimed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_gifts_sender ON gifts(sender_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_gifts_recipient ON gifts(recipient_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_gifts_recipient_claimed ON gifts(recipient_id, is_claimed)`);

    // Seasonal Events table (Gamification)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS seasonal_events (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        is_active BOOLEAN DEFAULT true,
        config JSONB DEFAULT '{}',
        banner_url VARCHAR(500),
        icon VARCHAR(10),
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_seasonal_events_active ON seasonal_events(is_active, start_date, end_date)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_seasonal_events_dates ON seasonal_events(start_date, end_date)`);

    // User Event Progress table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_event_progress (
        id UUID PRIMARY KEY,
        user_id BIGINT NOT NULL,
        event_id UUID NOT NULL,
        progress JSONB DEFAULT '{}',
        rewards_claimed TEXT[] DEFAULT '{}',
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now(),
        UNIQUE(user_id, event_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_event_progress_user ON user_event_progress(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_event_progress_event ON user_event_progress(event_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_event_progress_user_event ON user_event_progress(user_id, event_id)`);

    // Tournaments table (Gamification)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tournaments (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        registration_start TIMESTAMP NOT NULL,
        registration_end TIMESTAMP NOT NULL,
        max_participants INTEGER DEFAULT 100,
        min_participants INTEGER DEFAULT 2,
        status VARCHAR(50) DEFAULT 'upcoming',
        format VARCHAR(50) DEFAULT 'single_elimination',
        prize_pool JSONB DEFAULT '{}',
        rules JSONB DEFAULT '{}',
        banner_url VARCHAR(500),
        icon VARCHAR(10),
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status, start_date)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tournaments_dates ON tournaments(start_date, end_date)`);

    // Tournament Participants table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tournament_participants (
        id UUID PRIMARY KEY,
        tournament_id UUID NOT NULL,
        user_id BIGINT NOT NULL,
        seed INTEGER,
        score INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'registered',
        registered_at TIMESTAMP DEFAULT now(),
        UNIQUE(tournament_id, user_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament ON tournament_participants(tournament_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tournament_participants_user ON tournament_participants(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tournament_participants_score ON tournament_participants(tournament_id, score DESC)`);

    // Tournament Matches table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tournament_matches (
        id UUID PRIMARY KEY,
        tournament_id UUID NOT NULL,
        round INTEGER NOT NULL,
        match_number INTEGER NOT NULL,
        participant1_id UUID,
        participant2_id UUID,
        winner_id UUID,
        duel_id VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        scheduled_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament ON tournament_matches(tournament_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tournament_matches_round ON tournament_matches(tournament_id, round, match_number)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tournament_matches_status ON tournament_matches(status)`);

    // Activity Feed table (Gamification)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_feed (
        id UUID PRIMARY KEY,
        user_id BIGINT NOT NULL,
        activity_type VARCHAR(50) NOT NULL,
        activity_data JSONB DEFAULT '{}',
        target_id VARCHAR(255),
        target_type VARCHAR(50),
        is_public BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_feed_user ON activity_feed(user_id, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_feed_public ON activity_feed(is_public, created_at DESC) WHERE is_public = true`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_feed_type ON activity_feed(activity_type, created_at DESC)`);

    // ─── GIN indexes for full-text search performance ──
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_letters_title_fts 
        ON letters USING GIN (to_tsvector('russian', title))
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_letters_content_fts 
        ON letters USING GIN (to_tsvector('russian', COALESCE(content, '')))
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_duels_title_fts 
        ON duels USING GIN (to_tsvector('russian', COALESCE(title, '')))
    `);
    // Composite index for common letter queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_letters_user_status_created 
        ON letters(user_id, status, created_at DESC)
    `);
    // duels has challenger_id/opponent_id, not user_id; idx_duels_challenger_status already exists above

    // ─── Monetization tables ────────────────────────────

    // Stars purchase history
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stars_purchases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id BIGINT NOT NULL,
        item_type VARCHAR(50) NOT NULL,
        item_id VARCHAR(255),
        stars_amount INTEGER NOT NULL,
        telegram_payment_charge_id VARCHAR(255),
        provider_payment_charge_id VARCHAR(255),
        status VARCHAR(50) DEFAULT 'completed',
        created_at TIMESTAMP DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_stars_purchases_user ON stars_purchases(user_id, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_stars_purchases_status ON stars_purchases(status)`);

    // Premium subscriptions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS premium_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id BIGINT UNIQUE NOT NULL,
        plan VARCHAR(50) NOT NULL DEFAULT 'monthly',
        stars_paid INTEGER NOT NULL DEFAULT 0,
        started_at TIMESTAMP DEFAULT now(),
        expires_at TIMESTAMP NOT NULL,
        auto_renew BOOLEAN DEFAULT true,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_premium_user ON premium_subscriptions(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_premium_expires ON premium_subscriptions(expires_at) WHERE status = 'active'`);

    // XP/REP Store — purchase log
    await pool.query(`
      CREATE TABLE IF NOT EXISTS store_purchases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id BIGINT NOT NULL,
        item_type VARCHAR(50) NOT NULL,
        item_id VARCHAR(255),
        cost_xp INTEGER DEFAULT 0,
        cost_rep INTEGER DEFAULT 0,
        cost_stars INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_store_purchases_user ON store_purchases(user_id, created_at DESC)`);

    // Referral revenue share tracking
    await pool.query(`ALTER TABLE referral_events ADD COLUMN IF NOT EXISTS revenue_share_total INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE referral_events ADD COLUMN IF NOT EXISTS revenue_share_paid INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE referral_events ADD COLUMN IF NOT EXISTS tier VARCHAR(20) DEFAULT 'bronze'`);

    // Consumable boosts: active xp_boost_2x, etc.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_active_boosts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id BIGINT NOT NULL,
        boost_type VARCHAR(50) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_boosts_user_expires ON user_active_boosts(user_id, expires_at)`);

    // Analytics events (for retention, funnels)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id BIGINT,
        event VARCHAR(100) NOT NULL,
        properties JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_analytics_events_event ON analytics_events(event)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events(user_id, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at DESC)`);

    // Profile premium flag
    await pool.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS premium_expires_at TIMESTAMP`);
    await pool.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stars_balance INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trial_used_at TIMESTAMP`);
    // Spendable points balance
    await pool.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS spendable_xp INTEGER DEFAULT 0`);

    logger.info('✅ All tables created successfully');
    return true;
  } catch (error) {
    logger.error('❌ Error creating tables:', error);
    throw error;
  }
};

module.exports = { createTables };
