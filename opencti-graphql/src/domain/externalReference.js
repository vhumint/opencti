import { map } from 'ramda';
import uuid from 'uuid/v4';
import { delEditContext, setEditContext } from '../database/redis';
import {
  createRelation,
  deleteEntityById,
  deleteRelation,
  editInputTx,
  getById,
  dayFormat,
  monthFormat,
  yearFormat,
  notify,
  now,
  paginate,
  prepareString,
  takeWriteTx
} from '../database/grakn';
import { BUS_TOPICS } from '../config/conf';

export const findAll = args =>
  paginate('match $m isa External-Reference', args);
export const findByEntity = args =>
  paginate(
    `match $externalReference isa External-Reference; 
    $rel(external_reference:$externalReference, so:$so) isa external_references; 
    $so id ${args.objectId}`,
    args
  );

export const findById = externalReferenceId => getById(externalReferenceId);

export const search = args =>
  paginate(
    `match $m isa External-Reference 
    has source_name_lowercase $sn;
    $m has description_lowercase $desc;
    $m has url $url;
    { $sn contains "${prepareString(args.search.toLowerCase())}"; } or
    { $desc contains "${prepareString(args.search.toLowerCase())}"; } or
    { $url contains "${prepareString(args.search.toLowerCase())}"; }`,
    args,
    false
  );

export const addExternalReference = async (user, externalReference) => {
  const wTx = await takeWriteTx();
  const externalReferenceIterator = await wTx.query(`insert $externalReference isa External-Reference 
    has type "external-reference";
    $externalReference has stix_id "external-reference--${uuid()}";
    $externalReference has source_name "${prepareString(
      externalReference.source_name
    )}";
    $externalReference has description "${prepareString(
      externalReference.description
    )}";
    $externalReference has url "${
      externalReference.url
        ? prepareString(externalReference.url.toLowerCase())
        : ''
    }";
    $externalReference has hash "${prepareString(externalReference.hash)}";
    $externalReference has external_id "${prepareString(
      externalReference.external_id
    )}";
    $externalReference has created ${now()};
    $externalReference has modified ${now()};
    $externalReference has revoked false;
    $externalReference has created_at ${now()};
    $externalReference has created_at_day "${dayFormat(now())}";
    $externalReference has created_at_month "${monthFormat(now())}";
    $externalReference has created_at_year "${yearFormat(now())}";    
    $externalReference has updated_at ${now()};
  `);
  const createExternalReference = await externalReferenceIterator.next();
  const createdExternalReferenceId = await createExternalReference
    .map()
    .get('externalReference').id;

  if (externalReference.createdByRef) {
    await wTx.query(`match $from id ${createdExternalReferenceId};
         $to id ${externalReference.createdByRef};
         insert (so: $from, creator: $to)
         isa created_by_ref;`);
  }

  if (externalReference.markingDefinitions) {
    const createMarkingDefinition = markingDefinition =>
      wTx.query(
        `match $from id ${createdExternalReferenceId}; $to id ${markingDefinition}; insert (so: $from, marking: $to) isa object_marking_refs;`
      );
    const markingDefinitionsPromises = map(
      createMarkingDefinition,
      externalReference.markingDefinitions
    );
    await Promise.all(markingDefinitionsPromises);
  }

  await wTx.commit();

  return getById(createdExternalReferenceId).then(created =>
    notify(BUS_TOPICS.ExternalReference.ADDED_TOPIC, created, user)
  );
};

export const externalReferenceDelete = externalReferenceId =>
  deleteEntityById(externalReferenceId);

export const externalReferenceAddRelation = (
  user,
  externalReferenceId,
  input
) =>
  createRelation(externalReferenceId, input).then(relationData => {
    notify(BUS_TOPICS.ExternalReference.EDIT_TOPIC, relationData.node, user);
    return relationData;
  });

export const externalReferenceDeleteRelation = (
  user,
  externalReferenceId,
  relationId
) =>
  deleteRelation(externalReferenceId, relationId).then(relationData => {
    notify(BUS_TOPICS.ExternalReference.EDIT_TOPIC, relationData.node, user);
    return relationData;
  });

export const externalReferenceCleanContext = (user, externalReferenceId) => {
  delEditContext(user, externalReferenceId);
  return getById(externalReferenceId).then(externalReference =>
    notify(BUS_TOPICS.ExternalReference.EDIT_TOPIC, externalReference, user)
  );
};

export const externalReferenceEditContext = (
  user,
  externalReferenceId,
  input
) => {
  setEditContext(user, externalReferenceId, input);
  return getById(externalReferenceId).then(externalReference =>
    notify(BUS_TOPICS.ExternalReference.EDIT_TOPIC, externalReference, user)
  );
};

export const externalReferenceEditField = (user, externalReferenceId, input) =>
  editInputTx(externalReferenceId, input).then(externalReference =>
    notify(BUS_TOPICS.ExternalReference.EDIT_TOPIC, externalReference, user)
  );
