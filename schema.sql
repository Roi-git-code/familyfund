--
-- PostgreSQL database dump
--

-- Dumped from database version 17.0
-- Dumped by pg_dump version 17.0

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: refresh_member_contribution(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_member_contribution() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Clear existing data
    DELETE FROM member_contribution;
    
    -- Repopulate from transactions
    INSERT INTO member_contribution (member_id, year, jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec)
    SELECT 
        member_id,
        year,
        COALESCE(SUM(CASE WHEN month = 'jan' THEN amount ELSE 0 END), 0) as jan,
        COALESCE(SUM(CASE WHEN month = 'feb' THEN amount ELSE 0 END), 0) as feb,
        COALESCE(SUM(CASE WHEN month = 'mar' THEN amount ELSE 0 END), 0) as mar,
        COALESCE(SUM(CASE WHEN month = 'apr' THEN amount ELSE 0 END), 0) as apr,
        COALESCE(SUM(CASE WHEN month = 'may' THEN amount ELSE 0 END), 0) as may,
        COALESCE(SUM(CASE WHEN month = 'jun' THEN amount ELSE 0 END), 0) as jun,
        COALESCE(SUM(CASE WHEN month = 'jul' THEN amount ELSE 0 END), 0) as jul,
        COALESCE(SUM(CASE WHEN month = 'aug' THEN amount ELSE 0 END), 0) as aug,
        COALESCE(SUM(CASE WHEN month = 'sep' THEN amount ELSE 0 END), 0) as sep,
        COALESCE(SUM(CASE WHEN month = 'oct' THEN amount ELSE 0 END), 0) as oct,
        COALESCE(SUM(CASE WHEN month = 'nov' THEN amount ELSE 0 END), 0) as nov,
        COALESCE(SUM(CASE WHEN month = 'dec' THEN amount ELSE 0 END), 0) as dec
    FROM contribution_transactions
    GROUP BY member_id, year;
    
    RETURN NULL;
END;
$$;


--
-- Name: sync_contribution_changes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_contribution_changes() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- This function can be used to keep both tables in sync during transition
    -- You can implement logic here if needed
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: contribution_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contribution_transactions (
    id integer NOT NULL,
    member_id integer NOT NULL,
    amount numeric NOT NULL,
    transaction_date date NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    year integer GENERATED ALWAYS AS (EXTRACT(year FROM transaction_date)) STORED,
    month text GENERATED ALWAYS AS (
CASE
    WHEN (EXTRACT(month FROM transaction_date) = (1)::numeric) THEN 'jan'::text
    WHEN (EXTRACT(month FROM transaction_date) = (2)::numeric) THEN 'feb'::text
    WHEN (EXTRACT(month FROM transaction_date) = (3)::numeric) THEN 'mar'::text
    WHEN (EXTRACT(month FROM transaction_date) = (4)::numeric) THEN 'apr'::text
    WHEN (EXTRACT(month FROM transaction_date) = (5)::numeric) THEN 'may'::text
    WHEN (EXTRACT(month FROM transaction_date) = (6)::numeric) THEN 'jun'::text
    WHEN (EXTRACT(month FROM transaction_date) = (7)::numeric) THEN 'jul'::text
    WHEN (EXTRACT(month FROM transaction_date) = (8)::numeric) THEN 'aug'::text
    WHEN (EXTRACT(month FROM transaction_date) = (9)::numeric) THEN 'sep'::text
    WHEN (EXTRACT(month FROM transaction_date) = (10)::numeric) THEN 'oct'::text
    WHEN (EXTRACT(month FROM transaction_date) = (11)::numeric) THEN 'nov'::text
    WHEN (EXTRACT(month FROM transaction_date) = (12)::numeric) THEN 'dec'::text
    ELSE NULL::text
END) STORED
);


--
-- Name: contribution_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contribution_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contribution_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.contribution_transactions_id_seq OWNED BY public.contribution_transactions.id;


--
-- Name: email_verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_verifications (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    otp_code character varying(6) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    verified boolean DEFAULT false
);


--
-- Name: email_verifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_verifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_verifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_verifications_id_seq OWNED BY public.email_verifications.id;


--
-- Name: fund_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fund_categories (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    percentage numeric(5,2) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fund_categories_percentage_check CHECK (((percentage >= (0)::numeric) AND (percentage <= (100)::numeric)))
);


--
-- Name: fund_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fund_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fund_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fund_categories_id_seq OWNED BY public.fund_categories.id;


--
-- Name: fund_category_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fund_category_audit (
    id integer NOT NULL,
    category_id integer,
    old_percentage numeric(5,2),
    new_percentage numeric(5,2),
    changed_by integer,
    changed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: fund_category_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fund_category_audit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fund_category_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fund_category_audit_id_seq OWNED BY public.fund_category_audit.id;


--
-- Name: fund_request_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fund_request_categories (
    request_id integer NOT NULL,
    category_id integer NOT NULL
);


--
-- Name: fund_request_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fund_request_votes (
    id integer NOT NULL,
    fund_request_id integer NOT NULL,
    officer_id integer NOT NULL,
    vote_type character varying(10) NOT NULL,
    signed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fund_request_votes_vote_type_check CHECK (((vote_type)::text = ANY ((ARRAY['up'::character varying, 'down'::character varying])::text[])))
);


--
-- Name: fund_request_votes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fund_request_votes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fund_request_votes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fund_request_votes_id_seq OWNED BY public.fund_request_votes.id;


--
-- Name: fund_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fund_requests (
    id integer NOT NULL,
    member_id integer NOT NULL,
    request_type character varying(50) NOT NULL,
    amount numeric(12,2) NOT NULL,
    bank_account character varying(50) NOT NULL,
    additional_info text,
    status character varying(20) DEFAULT 'Pending'::character varying NOT NULL,
    reason text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    bank_name character varying(100),
    reviewed_by integer,
    reviewed_at timestamp without time zone
);


--
-- Name: fund_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fund_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fund_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fund_requests_id_seq OWNED BY public.fund_requests.id;


--
-- Name: member; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member (
    id integer NOT NULL,
    first_name text NOT NULL,
    middle_name text,
    sur_name text NOT NULL,
    date_of_birth date NOT NULL,
    address text NOT NULL,
    marital_status text NOT NULL,
    number_of_children integer DEFAULT 0 NOT NULL,
    father_alive boolean,
    mother_alive boolean,
    email text DEFAULT 'unknown@example.com'::text NOT NULL,
    phone text DEFAULT '0000000000'::text NOT NULL,
    gender character varying(10),
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT member_gender_check CHECK (((gender)::text = ANY ((ARRAY['Male'::character varying, 'Female'::character varying, 'Other'::character varying])::text[])))
);


--
-- Name: member_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_applications (
    id integer NOT NULL,
    first_name text NOT NULL,
    middle_name text,
    sur_name text NOT NULL,
    date_of_birth date NOT NULL,
    address text NOT NULL,
    email text NOT NULL,
    phone text NOT NULL,
    marital_status text,
    number_of_children integer DEFAULT 0,
    father_alive boolean DEFAULT false,
    mother_alive boolean DEFAULT false,
    status character varying(20) DEFAULT 'Submitted'::character varying NOT NULL,
    reviewer_id integer,
    reviewer_note text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    user_id integer,
    gender character varying(10),
    CONSTRAINT member_applications_gender_check CHECK (((gender)::text = ANY ((ARRAY['Male'::character varying, 'Female'::character varying, 'Other'::character varying])::text[])))
);


--
-- Name: member_applications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.member_applications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: member_applications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.member_applications_id_seq OWNED BY public.member_applications.id;


--
-- Name: member_contribution; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.member_contribution AS
 SELECT member_id,
    year,
    COALESCE(sum(
        CASE
            WHEN (month = 'jan'::text) THEN amount
            ELSE (0)::numeric
        END), (0)::numeric) AS jan,
    COALESCE(sum(
        CASE
            WHEN (month = 'feb'::text) THEN amount
            ELSE (0)::numeric
        END), (0)::numeric) AS feb,
    COALESCE(sum(
        CASE
            WHEN (month = 'mar'::text) THEN amount
            ELSE (0)::numeric
        END), (0)::numeric) AS mar,
    COALESCE(sum(
        CASE
            WHEN (month = 'apr'::text) THEN amount
            ELSE (0)::numeric
        END), (0)::numeric) AS apr,
    COALESCE(sum(
        CASE
            WHEN (month = 'may'::text) THEN amount
            ELSE (0)::numeric
        END), (0)::numeric) AS may,
    COALESCE(sum(
        CASE
            WHEN (month = 'jun'::text) THEN amount
            ELSE (0)::numeric
        END), (0)::numeric) AS jun,
    COALESCE(sum(
        CASE
            WHEN (month = 'jul'::text) THEN amount
            ELSE (0)::numeric
        END), (0)::numeric) AS jul,
    COALESCE(sum(
        CASE
            WHEN (month = 'aug'::text) THEN amount
            ELSE (0)::numeric
        END), (0)::numeric) AS aug,
    COALESCE(sum(
        CASE
            WHEN (month = 'sep'::text) THEN amount
            ELSE (0)::numeric
        END), (0)::numeric) AS sep,
    COALESCE(sum(
        CASE
            WHEN (month = 'oct'::text) THEN amount
            ELSE (0)::numeric
        END), (0)::numeric) AS oct,
    COALESCE(sum(
        CASE
            WHEN (month = 'nov'::text) THEN amount
            ELSE (0)::numeric
        END), (0)::numeric) AS nov,
    COALESCE(sum(
        CASE
            WHEN (month = 'dec'::text) THEN amount
            ELSE (0)::numeric
        END), (0)::numeric) AS "dec",
    COALESCE(sum(amount), (0)::numeric) AS total_year
   FROM public.contribution_transactions
  GROUP BY member_id, year;


--
-- Name: member_contribution_backup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_contribution_backup (
    id integer,
    member_id integer,
    year integer,
    jan numeric,
    feb numeric,
    mar numeric,
    apr numeric,
    may numeric,
    jun numeric,
    jul numeric,
    aug numeric,
    sep numeric,
    oct numeric,
    nov numeric,
    "dec" numeric
);


--
-- Name: member_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.member_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: member_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.member_id_seq OWNED BY public.member.id;


--
-- Name: next_of_kin; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.next_of_kin (
    id integer NOT NULL,
    member_id integer NOT NULL,
    first_name text NOT NULL,
    middle_name text,
    sur_name text NOT NULL,
    gender character varying(10),
    email text,
    phone text NOT NULL,
    address text NOT NULL,
    relationship character varying(50) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT next_of_kin_gender_check CHECK (((gender)::text = ANY ((ARRAY['Male'::character varying, 'Female'::character varying, 'Other'::character varying])::text[]))),
    CONSTRAINT next_of_kin_relationship_check CHECK (((relationship)::text = ANY ((ARRAY['Father'::character varying, 'Mother'::character varying, 'Spouse'::character varying, 'Son'::character varying, 'Daughter'::character varying, 'Brother'::character varying, 'Sister'::character varying, 'Other'::character varying])::text[])))
);


--
-- Name: next_of_kin_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.next_of_kin_applications (
    id integer NOT NULL,
    application_id integer NOT NULL,
    first_name text NOT NULL,
    middle_name text,
    sur_name text NOT NULL,
    gender character varying(10),
    email text,
    phone text NOT NULL,
    address text NOT NULL,
    relationship character varying(50) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT next_of_kin_applications_gender_check CHECK (((gender)::text = ANY ((ARRAY['Male'::character varying, 'Female'::character varying, 'Other'::character varying])::text[]))),
    CONSTRAINT next_of_kin_applications_relationship_check CHECK (((relationship)::text = ANY ((ARRAY['Father'::character varying, 'Mother'::character varying, 'Spouse'::character varying, 'Son'::character varying, 'Daughter'::character varying, 'Brother'::character varying, 'Sister'::character varying, 'Other'::character varying])::text[])))
);


--
-- Name: next_of_kin_applications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.next_of_kin_applications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: next_of_kin_applications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.next_of_kin_applications_id_seq OWNED BY public.next_of_kin_applications.id;


--
-- Name: next_of_kin_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.next_of_kin_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: next_of_kin_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.next_of_kin_id_seq OWNED BY public.next_of_kin.id;


--
-- Name: notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notes (
    id integer NOT NULL,
    title text NOT NULL,
    content text
);


--
-- Name: notes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notes_id_seq OWNED BY public.notes.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    member_id integer NOT NULL,
    message text NOT NULL,
    read boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: oma_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oma_users (
    id integer NOT NULL,
    first_name text,
    phone text NOT NULL,
    password text NOT NULL,
    email text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    middle_name character varying(100),
    sur_name character varying(100)
);


--
-- Name: oma_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.oma_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: oma_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.oma_users_id_seq OWNED BY public.oma_users.id;


--
-- Name: password_resets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_resets (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token character varying(128) NOT NULL,
    expires_at timestamp without time zone NOT NULL
);


--
-- Name: password_resets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.password_resets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: password_resets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.password_resets_id_seq OWNED BY public.password_resets.id;


--
-- Name: payment_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_links (
    id integer NOT NULL,
    amount numeric(10,2) NOT NULL,
    lipia_link text NOT NULL,
    description character varying(255),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: payment_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payment_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payment_links_id_seq OWNED BY public.payment_links.id;


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id integer NOT NULL,
    member_id integer,
    amount numeric(10,2) NOT NULL,
    payment_method character varying(50) NOT NULL,
    phone_number character varying(20) NOT NULL,
    transaction_id character varying(100) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    metadata jsonb,
    gateway_response jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;


--
-- Name: user_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_requests (
    id integer NOT NULL,
    member_id integer NOT NULL,
    updated_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    attachments jsonb,
    status character varying(20) DEFAULT 'In Progress'::character varying NOT NULL,
    reason text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    request_type character varying(20) DEFAULT 'profile_update'::character varying NOT NULL,
    category character varying(50),
    amount numeric(12,2),
    account_number character varying(30),
    old_values jsonb,
    reviewed_by integer,
    reviewed_at timestamp without time zone
);


--
-- Name: user_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_requests_id_seq OWNED BY public.user_requests.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username character varying(100) NOT NULL,
    password text NOT NULL,
    role character varying(50) NOT NULL,
    member_id integer,
    email_verified boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: contribution_transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contribution_transactions ALTER COLUMN id SET DEFAULT nextval('public.contribution_transactions_id_seq'::regclass);


--
-- Name: email_verifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verifications ALTER COLUMN id SET DEFAULT nextval('public.email_verifications_id_seq'::regclass);


--
-- Name: fund_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_categories ALTER COLUMN id SET DEFAULT nextval('public.fund_categories_id_seq'::regclass);


--
-- Name: fund_category_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_category_audit ALTER COLUMN id SET DEFAULT nextval('public.fund_category_audit_id_seq'::regclass);


--
-- Name: fund_request_votes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_request_votes ALTER COLUMN id SET DEFAULT nextval('public.fund_request_votes_id_seq'::regclass);


--
-- Name: fund_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_requests ALTER COLUMN id SET DEFAULT nextval('public.fund_requests_id_seq'::regclass);


--
-- Name: member id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member ALTER COLUMN id SET DEFAULT nextval('public.member_id_seq'::regclass);


--
-- Name: member_applications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_applications ALTER COLUMN id SET DEFAULT nextval('public.member_applications_id_seq'::regclass);


--
-- Name: next_of_kin id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.next_of_kin ALTER COLUMN id SET DEFAULT nextval('public.next_of_kin_id_seq'::regclass);


--
-- Name: next_of_kin_applications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.next_of_kin_applications ALTER COLUMN id SET DEFAULT nextval('public.next_of_kin_applications_id_seq'::regclass);


--
-- Name: notes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes ALTER COLUMN id SET DEFAULT nextval('public.notes_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: oma_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oma_users ALTER COLUMN id SET DEFAULT nextval('public.oma_users_id_seq'::regclass);


--
-- Name: password_resets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_resets ALTER COLUMN id SET DEFAULT nextval('public.password_resets_id_seq'::regclass);


--
-- Name: payment_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_links ALTER COLUMN id SET DEFAULT nextval('public.payment_links_id_seq'::regclass);


--
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);


--
-- Name: user_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_requests ALTER COLUMN id SET DEFAULT nextval('public.user_requests_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: contribution_transactions contribution_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contribution_transactions
    ADD CONSTRAINT contribution_transactions_pkey PRIMARY KEY (id);


--
-- Name: email_verifications email_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verifications
    ADD CONSTRAINT email_verifications_pkey PRIMARY KEY (id);


--
-- Name: fund_categories fund_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_categories
    ADD CONSTRAINT fund_categories_name_key UNIQUE (name);


--
-- Name: fund_categories fund_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_categories
    ADD CONSTRAINT fund_categories_pkey PRIMARY KEY (id);


--
-- Name: fund_category_audit fund_category_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_category_audit
    ADD CONSTRAINT fund_category_audit_pkey PRIMARY KEY (id);


--
-- Name: fund_request_categories fund_request_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_request_categories
    ADD CONSTRAINT fund_request_categories_pkey PRIMARY KEY (request_id, category_id);


--
-- Name: fund_request_votes fund_request_votes_fund_request_id_officer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_request_votes
    ADD CONSTRAINT fund_request_votes_fund_request_id_officer_id_key UNIQUE (fund_request_id, officer_id);


--
-- Name: fund_request_votes fund_request_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_request_votes
    ADD CONSTRAINT fund_request_votes_pkey PRIMARY KEY (id);


--
-- Name: fund_requests fund_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_requests
    ADD CONSTRAINT fund_requests_pkey PRIMARY KEY (id);


--
-- Name: member_applications member_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_applications
    ADD CONSTRAINT member_applications_pkey PRIMARY KEY (id);


--
-- Name: member member_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member
    ADD CONSTRAINT member_email_unique UNIQUE (email);


--
-- Name: member member_fullname_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member
    ADD CONSTRAINT member_fullname_unique UNIQUE (first_name, middle_name, sur_name);


--
-- Name: member member_phone_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member
    ADD CONSTRAINT member_phone_unique UNIQUE (phone);


--
-- Name: member member_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member
    ADD CONSTRAINT member_pkey PRIMARY KEY (id);


--
-- Name: next_of_kin_applications next_of_kin_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.next_of_kin_applications
    ADD CONSTRAINT next_of_kin_applications_pkey PRIMARY KEY (id);


--
-- Name: next_of_kin next_of_kin_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.next_of_kin
    ADD CONSTRAINT next_of_kin_pkey PRIMARY KEY (id);


--
-- Name: notes notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: oma_users oma_users_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oma_users
    ADD CONSTRAINT oma_users_phone_key UNIQUE (phone);


--
-- Name: oma_users oma_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oma_users
    ADD CONSTRAINT oma_users_pkey PRIMARY KEY (id);


--
-- Name: password_resets password_resets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_resets
    ADD CONSTRAINT password_resets_pkey PRIMARY KEY (id);


--
-- Name: password_resets password_resets_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_resets
    ADD CONSTRAINT password_resets_token_key UNIQUE (token);


--
-- Name: payment_links payment_links_amount_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_links
    ADD CONSTRAINT payment_links_amount_key UNIQUE (amount);


--
-- Name: payment_links payment_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_links
    ADD CONSTRAINT payment_links_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: payments payments_transaction_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_transaction_id_key UNIQUE (transaction_id);


--
-- Name: user_requests user_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_requests
    ADD CONSTRAINT user_requests_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: idx_contribution_transactions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contribution_transactions_date ON public.contribution_transactions USING btree (transaction_date);


--
-- Name: idx_contribution_transactions_member_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contribution_transactions_member_id ON public.contribution_transactions USING btree (member_id);


--
-- Name: idx_contribution_transactions_year_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contribution_transactions_year_month ON public.contribution_transactions USING btree (year, month);


--
-- Name: idx_email_verifications_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_verifications_email ON public.email_verifications USING btree (email);


--
-- Name: idx_email_verifications_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_verifications_expires ON public.email_verifications USING btree (expires_at);


--
-- Name: idx_fund_request_votes_officer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fund_request_votes_officer_id ON public.fund_request_votes USING btree (officer_id);


--
-- Name: idx_fund_request_votes_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fund_request_votes_request_id ON public.fund_request_votes USING btree (fund_request_id);


--
-- Name: idx_next_of_kin_applications_app_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_next_of_kin_applications_app_id ON public.next_of_kin_applications USING btree (application_id);


--
-- Name: idx_next_of_kin_applications_application_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_next_of_kin_applications_application_id ON public.next_of_kin_applications USING btree (application_id);


--
-- Name: idx_next_of_kin_member_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_next_of_kin_member_id ON public.next_of_kin USING btree (member_id);


--
-- Name: idx_payment_links_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_links_active ON public.payment_links USING btree (is_active);


--
-- Name: idx_payment_links_amount; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_links_amount ON public.payment_links USING btree (amount);


--
-- Name: idx_payments_member_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_member_id ON public.payments USING btree (member_id);


--
-- Name: idx_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_status ON public.payments USING btree (status);


--
-- Name: idx_payments_transaction_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_transaction_id ON public.payments USING btree (transaction_id);


--
-- Name: member_applications_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX member_applications_email_idx ON public.member_applications USING btree (email);


--
-- Name: member_applications_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX member_applications_phone_idx ON public.member_applications USING btree (phone);


--
-- Name: member_applications_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX member_applications_user_id_idx ON public.member_applications USING btree (user_id);


--
-- Name: oma_users_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX oma_users_phone_idx ON public.oma_users USING btree (phone);


--
-- Name: contribution_transactions contribution_transactions_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contribution_transactions
    ADD CONSTRAINT contribution_transactions_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.member(id) ON DELETE CASCADE;


--
-- Name: fund_category_audit fund_category_audit_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_category_audit
    ADD CONSTRAINT fund_category_audit_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.fund_categories(id) ON DELETE CASCADE;


--
-- Name: fund_category_audit fund_category_audit_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_category_audit
    ADD CONSTRAINT fund_category_audit_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.member(id) ON DELETE SET NULL;


--
-- Name: fund_request_categories fund_request_categories_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_request_categories
    ADD CONSTRAINT fund_request_categories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.fund_categories(id) ON DELETE CASCADE;


--
-- Name: fund_request_categories fund_request_categories_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_request_categories
    ADD CONSTRAINT fund_request_categories_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.fund_requests(id) ON DELETE CASCADE;


--
-- Name: fund_request_votes fund_request_votes_fund_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_request_votes
    ADD CONSTRAINT fund_request_votes_fund_request_id_fkey FOREIGN KEY (fund_request_id) REFERENCES public.fund_requests(id) ON DELETE CASCADE;


--
-- Name: fund_request_votes fund_request_votes_officer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_request_votes
    ADD CONSTRAINT fund_request_votes_officer_id_fkey FOREIGN KEY (officer_id) REFERENCES public.member(id) ON DELETE CASCADE;


--
-- Name: fund_requests fund_requests_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_requests
    ADD CONSTRAINT fund_requests_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.member(id) ON DELETE CASCADE;


--
-- Name: fund_requests fund_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_requests
    ADD CONSTRAINT fund_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.member(id) ON DELETE SET NULL;


--
-- Name: member_applications member_applications_user_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_applications
    ADD CONSTRAINT member_applications_user_fk FOREIGN KEY (user_id) REFERENCES public.oma_users(id) ON DELETE SET NULL;


--
-- Name: next_of_kin_applications next_of_kin_applications_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.next_of_kin_applications
    ADD CONSTRAINT next_of_kin_applications_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.member_applications(id) ON DELETE CASCADE;


--
-- Name: next_of_kin next_of_kin_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.next_of_kin
    ADD CONSTRAINT next_of_kin_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.member(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.member(id) ON DELETE CASCADE;


--
-- Name: password_resets password_resets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_resets
    ADD CONSTRAINT password_resets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payments payments_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.member(id);


--
-- Name: user_requests user_requests_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_requests
    ADD CONSTRAINT user_requests_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.member(id) ON DELETE CASCADE;


--
-- Name: user_requests user_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_requests
    ADD CONSTRAINT user_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.member(id) ON DELETE CASCADE;


--
-- Name: users users_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.member(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

