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

SET default_tablespace = '';

SET default_table_access_method = heap;

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
    phone text DEFAULT '0000000000'::text NOT NULL
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
    user_id integer
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
-- Name: member_contribution; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_contribution (
    id integer NOT NULL,
    member_id integer,
    year integer NOT NULL,
    jan numeric DEFAULT 0,
    feb numeric DEFAULT 0,
    mar numeric DEFAULT 0,
    apr numeric DEFAULT 0,
    may numeric DEFAULT 0,
    jun numeric DEFAULT 0,
    jul numeric DEFAULT 0,
    aug numeric DEFAULT 0,
    sep numeric DEFAULT 0,
    oct numeric DEFAULT 0,
    nov numeric DEFAULT 0,
    "dec" numeric DEFAULT 0
);


--
-- Name: member_contribution_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.member_contribution_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: member_contribution_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.member_contribution_id_seq OWNED BY public.member_contribution.id;


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
    member_id integer
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
-- Name: fund_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_categories ALTER COLUMN id SET DEFAULT nextval('public.fund_categories_id_seq'::regclass);


--
-- Name: fund_category_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_category_audit ALTER COLUMN id SET DEFAULT nextval('public.fund_category_audit_id_seq'::regclass);


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
-- Name: member_contribution id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_contribution ALTER COLUMN id SET DEFAULT nextval('public.member_contribution_id_seq'::regclass);


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
-- Name: user_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_requests ALTER COLUMN id SET DEFAULT nextval('public.user_requests_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


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
-- Name: member_contribution member_contribution_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_contribution
    ADD CONSTRAINT member_contribution_pkey PRIMARY KEY (id);


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
-- Name: member_contribution member_contribution_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_contribution
    ADD CONSTRAINT member_contribution_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.member(id) ON DELETE CASCADE;


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

