import { map } from 'ramda';
import uuid from 'uuid/v4';
import {
  deleteEntityById,
  getById,
  dayFormat,
  monthFormat,
  yearFormat,
  notify,
  now,
  paginate,
  prepareDate,
  takeWriteTx,
  prepareString,
  timeSeries
} from '../database/grakn';
import { BUS_TOPICS } from '../config/conf';

export const findAll = args => paginate('match $m isa Campaign', args);

export const campaignsTimeSeries = args =>
  timeSeries('match $x isa Campaign', args);

export const findByEntity = args =>
  paginate(
    `match $c isa Campaign; 
    $rel($i, $to) isa stix_relation; 
    $to id ${args.objectId}`,
    args
  );

export const campaignsTimeSeriesByEntity = args =>
  timeSeries(
    `match $x isa Campaign; 
    $rel($x, $to) isa stix_relation; 
    $to id ${args.objectId}`,
    args
  );

export const findById = campaignId => getById(campaignId);

export const addCampaign = async (user, campaign) => {
  const wTx = await takeWriteTx();
  const campaignIterator = await wTx.query(`insert $campaign isa Campaign 
    has type "campaign";
    $campaign has stix_id "campaign--${uuid()}";
    $campaign has stix_label "";
    $campaign has alias "";
    $campaign has name "${prepareString(campaign.name)}";
    $campaign has description "${prepareString(campaign.description)}";
    $campaign has first_seen ${prepareDate(campaign.first_seen)};
    $campaign has first_seen_day "${dayFormat(campaign.first_seen)}";
    $campaign has first_seen_month "${monthFormat(campaign.first_seen)}";
    $campaign has first_seen_year "${yearFormat(campaign.first_seen)}";
    $campaign has last_seen ${prepareDate(campaign.last_seen)};
    $campaign has last_seen_day "${dayFormat(campaign.last_seen)}";
    $campaign has last_seen_month "${monthFormat(campaign.last_seen)}";
    $campaign has last_seen_year "${yearFormat(campaign.last_seen)}";
    $campaign has created ${now()};
    $campaign has modified ${now()};
    $campaign has revoked false;
    $campaign has created_at ${now()};
    $campaign has created_at_day "${dayFormat(now())}";
    $campaign has created_at_month "${monthFormat(now())}";
    $campaign has created_at_year "${yearFormat(now())}";
    $campaign has updated_at ${now()};
  `);
  const createCampaign = await campaignIterator.next();
  const createdCampaignId = await createCampaign.map().get('campaign').id;

  if (campaign.createdByRef) {
    await wTx.query(`match $from id ${createdCampaignId};
         $to id ${campaign.createdByRef};
         insert (so: $from, creator: $to)
         isa created_by_ref;`);
  }

  if (campaign.markingDefinitions) {
    const createMarkingDefinition = markingDefinition =>
      wTx.query(
        `match $from id ${createdCampaignId}; $to id ${markingDefinition}; insert (so: $from, marking: $to) isa object_marking_refs;`
      );
    const markingDefinitionsPromises = map(
      createMarkingDefinition,
      campaign.markingDefinitions
    );
    await Promise.all(markingDefinitionsPromises);
  }

  await wTx.commit();

  return getById(createdCampaignId).then(created =>
    notify(BUS_TOPICS.StixDomainEntity.ADDED_TOPIC, created, user)
  );
};

export const campaignDelete = campaignId => deleteEntityById(campaignId);
