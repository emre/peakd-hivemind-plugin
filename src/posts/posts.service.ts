import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { prepare } from 'src/utils/strings';
import { HivePost } from './models/hive-post.model';

const POST_SELECT = `SELECT coalesce(v.votes, '[]'::json) as active_votes
  , p.author
  , CASE p.is_paidout
      WHEN true THEN (p.payout::decimal - split_part(p.curator_payout_value, ' ', 1)::decimal) || ' HBD'
      ELSE (p.pending_payout::decimal - split_part(p.curator_payout_value, ' ', 1)::decimal) || ' HBD'
    END as author_payout_value
  , p.author_rep as author_reputation
  , CASE coalesce(p.role_id, 0)
      WHEN -2 THEN 'muted'
      WHEN  2 THEN 'member'
      WHEN  4 THEN 'mod'
      WHEN  6 THEN 'admin'
      WHEN  8 THEN 'owner'
      ELSE 'guest'
    END as author_role
  , p.role_title as author_title
  , p.beneficiaries
  , null as blacklists
  , p.body
  , p.category
  , p.children
  , p.community_name as community
  , p.community_title
  , p.created_at as created
  , p.curator_payout_value
  , p."depth"
  , p.is_paidout
  , p."json"::json as json_metadata
  , p.max_accepted_payout
  , p.rshares::int8 as net_rshares
  , p.payout::numeric
  , p.payout_at
  , p.pending_payout || ' HBD' as pending_payout_value
  , p.percent_hbd
  , p.permlink
  , p.id as post_id
  , p.promoted || ' HBD' as promoted
  , '[]'::json as replies
  , json_build_object('total_votes', p.total_votes) as stats
  , p.title
  , p.updated_at as updated
  , p.url`;

const FEED_BY_AUTHORS = `WITH posts as (
  select p.*
  from hive_posts_api_helper h
  join hive_posts_view p on p.id = h.id
  where split_part(h.author_s_permlink, '/', 1) in ('{authors}')
    and p."depth" = 0
    and ({start} = 0 or p.id < {start})
  order by h.id desc
  limit {limit}
)
${POST_SELECT}
FROM posts p
LEFT JOIN LATERAL(
	select v.post_id, json_agg(json_build_object('voter', a."name", 'rshares', v.rshares)) as votes
	from hive_votes v
	join hive_accounts a on a.id = v.voter_id
	where v.post_id in (select id from posts)
	group by v.post_id) as v ON v.post_id = p.id
order by p.id desc`;

const POSTS_BY_PERMLINKS = `${POST_SELECT}
FROM hive_posts_api_helper h
JOIN hive_posts_view p on p.id = h.id
LEFT JOIN LATERAL(
	select json_agg(json_build_object('voter', a."name", 'rshares', v.rshares)) as votes
	from hive_votes v
	join hive_accounts a on a.id = v.voter_id
	where v.post_id = p.id) as v ON true
WHERE p.depth = 0
      and h.author_s_permlink in ('{permlinks}')`;

const PAGE_SIZE = 20;

@Injectable()
export class PostsService {
  constructor(private sequelize: Sequelize, @InjectModel(HivePost) private postModel: typeof HivePost) {}

  async feedByAuthors(authors: string[], start: number = 0, limit: number = 20): Promise<HivePost[]> {
    const query = prepare(FEED_BY_AUTHORS, {
      authors: authors.join('\',\''),
      start: start,
      limit: limit
    });
    return await this.sequelize.query(query, {
      model: HivePost
    });
  }

  async postsByPermlinks(permlinks: string[]): Promise<HivePost[]> {
    const query = prepare(POSTS_BY_PERMLINKS, { permlinks: permlinks.join('\',\'') });
    return await this.sequelize.query(query, {
      model: HivePost
    });
  }
}
