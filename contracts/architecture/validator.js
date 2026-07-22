const fs = require('node:fs');
const path = require('node:path');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function edgeKey(edge) {
  return `${edge.from}->${edge.to}:${edge.relationship}`;
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function uniqueIds(items, label) {
  const seen = new Set();
  for (const item of items) {
    assertCondition(item && typeof item.id === 'string' && item.id.length > 0, `${label} has item without id`);
    assertCondition(!seen.has(item.id), `${label} has duplicate id: ${item.id}`);
    seen.add(item.id);
  }
  return seen;
}

function assertFileExists(repoRoot, relativePath, label) {
  const filePath = path.join(repoRoot, relativePath);
  assertCondition(fs.existsSync(filePath), `${label} does not exist: ${relativePath}`);
  return filePath;
}

function validateArtifactContract(artifact, options) {
  assertCondition(typeof artifact.schema === 'string', 'artifact schema must be a string');
  assertCondition(artifact.graph && typeof artifact.graph === 'object', 'artifact must define graph');
  assertCondition(Array.isArray(artifact.graph.nodes), 'artifact graph.nodes must be an array');
  assertCondition(Array.isArray(artifact.graph.edges), 'artifact graph.edges must be an array');
  assertCondition(Array.isArray(artifact.graph.forbiddenEdges), 'artifact graph.forbiddenEdges must be an array');

  const nodeIds = uniqueIds(artifact.graph.nodes, 'artifact graph.nodes');
  const nodesById = new Map(artifact.graph.nodes.map((node) => [node.id, node]));
  const governedSourceTypes = new Set([
    'normative-contract',
    'deterministic-fixture',
    'conformance-test',
  ]);

  for (const node of artifact.graph.nodes) {
    if (!governedSourceTypes.has(node.type)) continue;
    assertCondition(
      typeof node.source === 'string' && node.source.length > 0,
      `governed artifact node missing source: ${node.id}`
    );
    assertFileExists(options.repoRoot, node.source, `governed source for ${node.id}`);
  }

  for (const edge of [...artifact.graph.edges, ...artifact.graph.forbiddenEdges]) {
    assertCondition(nodeIds.has(edge.from), `edge from unknown node: ${edge.from}`);
    assertCondition(nodeIds.has(edge.to), `edge to unknown node: ${edge.to}`);
    assertCondition(Boolean(edge.relationship), `edge missing relationship: ${JSON.stringify(edge)}`);
  }

  if (artifact.promotionUnits !== undefined) {
    assertCondition(Array.isArray(artifact.promotionUnits), 'artifact promotionUnits must be an array');
    uniqueIds(artifact.promotionUnits, 'artifact promotionUnits');
    for (const unit of artifact.promotionUnits) {
      assertCondition(
        unit.status === 'proposed' || unit.status === 'sealed',
        `promotion unit has unsupported authority status: ${unit.id}`
      );
      assertCondition(
        Array.isArray(unit.normativeContracts) && unit.normativeContracts.length > 0,
        `promotion unit missing normative contracts: ${unit.id}`
      );
      assertCondition(
        Array.isArray(unit.supportingArtifacts) && unit.supportingArtifacts.length > 0,
        `promotion unit missing supporting artifacts: ${unit.id}`
      );
      for (const nodeId of unit.normativeContracts) {
        const node = nodesById.get(nodeId);
        assertCondition(node && node.type === 'normative-contract', `invalid promotion contract: ${nodeId}`);
        assertCondition(
          node.status === unit.status,
          `promotion contract status must match unit ${unit.status}: ${nodeId}`
        );
        const contractSource = fs.readFileSync(path.join(options.repoRoot, node.source), 'utf8');
        const expectedStatusMarker = unit.status === 'sealed' ? '**Sealed' : '**Proposed';
        assertCondition(
          contractSource.includes(expectedStatusMarker),
          `promotion contract Markdown status must match unit ${unit.status}: ${nodeId}`
        );
        assertCondition(
          artifact.graph.edges.some(
            (edge) => edge.to === nodeId && edge.relationship === 'substantiates'
          ),
          `promotion contract missing fixture evidence: ${nodeId}`
        );
        assertCondition(
          artifact.graph.edges.some((edge) => edge.to === nodeId && edge.relationship === 'verifies'),
          `promotion contract missing conformance test: ${nodeId}`
        );
      }
      for (const nodeId of unit.supportingArtifacts) {
        const node = nodesById.get(nodeId);
        assertCondition(
          node && (node.type === 'deterministic-fixture' || node.type === 'conformance-test'),
          `invalid promotion support artifact: ${nodeId}`
        );
      }
    }
  }

  const owners = new Map();
  for (const edge of artifact.graph.edges) {
    if (edge.relationship !== 'owns' || edge.allowMultipleOwners === true) continue;
    assertCondition(
      !owners.has(edge.to),
      `${edge.to} has duplicate owners: ${owners.get(edge.to)} and ${edge.from}`
    );
    owners.set(edge.to, edge.from);
  }

  if (artifact.expectedLifecycle !== undefined) {
    assertCondition(Array.isArray(artifact.expectedLifecycle), 'artifact expectedLifecycle must be an array');
    uniqueIds(artifact.expectedLifecycle, 'artifact expectedLifecycle');
    for (const state of artifact.expectedLifecycle) {
      if (state.ownedBy !== undefined) {
        assertCondition(nodeIds.has(state.ownedBy), `lifecycle state has unknown owner: ${state.id}`);
      }
    }
  }

  return { nodeIds };
}

function validateStructureContract(artifact, structure, options) {
  assertCondition(typeof structure.schema === 'string', 'structure schema must be a string');

  if (options.artifactPathForContract) {
    assertCondition(
      structure.artifactContract === options.artifactPathForContract,
      `structure artifactContract must be ${options.artifactPathForContract}`
    );
  }

  if (artifact.checkpoint && artifact.checkpoint.structureContract && options.structurePathForContract) {
    assertCondition(
      artifact.checkpoint.structureContract === options.structurePathForContract,
      `artifact checkpoint.structureContract must be ${options.structurePathForContract}`
    );
  }

  const nodeIds = new Set(artifact.graph.nodes.map((node) => node.id));
  const artifactEdges = new Set(artifact.graph.edges.map(edgeKey));
  const forbiddenEdges = new Set(artifact.graph.forbiddenEdges.map(edgeKey));

  if (structure.nodeMapping) {
    for (const [nodeId, mapping] of Object.entries(structure.nodeMapping)) {
      assertCondition(nodeIds.has(nodeId), `node mapping references unknown artifact node: ${nodeId}`);
      if (mapping.implementation) {
        assertFileExists(options.repoRoot, mapping.implementation, `implementation for ${nodeId}`);
      }
      if (mapping.surface) {
        assertFileExists(options.repoRoot, mapping.surface, `surface for ${nodeId}`);
      }
    }
  }

  assertCondition(Array.isArray(structure.implementedEdges), 'structure implementedEdges must be an array');
  for (const edge of structure.implementedEdges) {
    assertCondition(
      artifactEdges.has(edgeKey(edge)),
      `structure implements edge not allowed by artifact graph: ${edgeKey(edge)}`
    );
    assertCondition(
      !forbiddenEdges.has(edgeKey(edge)),
      `structure implements forbidden edge: ${edgeKey(edge)}`
    );
  }

  if (structure.regions !== undefined) {
    assertCondition(Array.isArray(structure.regions), 'structure regions must be an array');
    uniqueIds(structure.regions, 'structure regions');

    for (const region of structure.regions) {
      assertCondition(nodeIds.has(region.artifactNode), `region maps to unknown artifact node: ${region.id}`);
      if (region.selector !== undefined) {
        assertCondition(typeof region.selector === 'string', `region selector must be string: ${region.id}`);
      }
      const model = artifact.regionModel && artifact.regionModel[region.artifactNode];
      if (model && model.stateControlled !== undefined && region.stateControlled !== undefined) {
        assertCondition(
          region.stateControlled === model.stateControlled,
          `region stateControlled does not match artifact model: ${region.id}`
        );
      }
    }
  }

  if (structure.states !== undefined) {
    validateStates(artifact, structure);
  }

  if (structure.executionOwnership) {
    validateExecutionOwnership(structure, options);
  }

  validateMigrationDebt(structure, options);
}

function validateStates(artifact, structure) {
  assertCondition(Array.isArray(structure.states), 'structure states must be an array');
  uniqueIds(structure.states, 'structure states');

  const lifecycleIds = new Set((artifact.expectedLifecycle || []).map((state) => state.id));
  for (const state of structure.states) {
    if (state.lifecycle !== undefined) {
      assertCondition(lifecycleIds.has(state.lifecycle), `state maps to unknown lifecycle: ${state.id}`);
    }
  }

  const regionsById = new Map((structure.regions || []).map((region) => [region.id, region]));
  const stateFieldRefs = structure.validation && structure.validation.stateFieldRefs;
  if (stateFieldRefs !== undefined) {
    assertCondition(Array.isArray(stateFieldRefs), 'structure validation.stateFieldRefs must be an array');
    for (const ref of stateFieldRefs) {
      const region = regionsById.get(ref.region);
      assertCondition(region, `stateFieldRef references unknown region: ${ref.region}`);
      const allowed = region[ref.allowedFrom];
      assertCondition(Array.isArray(allowed), `stateFieldRef allowedFrom is not an array: ${ref.allowedFrom}`);
      const allowedSet = new Set(allowed);
      for (const state of structure.states) {
        assertCondition(
          allowedSet.has(state[ref.field]),
          `state ${state.id} has invalid ${ref.field}: ${state[ref.field]}`
        );
      }
    }
  }

  const requiredTerminalStates = structure.validation && structure.validation.requiredTerminalStates;
  if (requiredTerminalStates !== undefined) {
    assertCondition(Array.isArray(requiredTerminalStates), 'structure validation.requiredTerminalStates must be an array');
    const statesById = new Map(structure.states.map((state) => [state.id, state]));
    for (const requirement of requiredTerminalStates) {
      const state = statesById.get(requirement.state);
      assertCondition(state, `required terminal state missing: ${requirement.state}`);
      for (const [field, expected] of Object.entries(requirement.requires || {})) {
        assertCondition(
          state[field] === expected,
          `terminal state ${requirement.state} expected ${field}=${expected}, got ${state[field]}`
        );
      }
    }
  }
}

function validateExecutionOwnership(structure, options) {
  const ownership = structure.executionOwnership;
  if (ownership.implementationFile) {
    const implementationPath = assertFileExists(
      options.repoRoot,
      ownership.implementationFile,
      'execution ownership implementationFile'
    );
    const source = fs.readFileSync(implementationPath, 'utf8');

    for (const method of ownership.allowedFundMovingMethods || []) {
      const symbol = method.split('.').pop();
      assertCondition(source.includes(symbol), `execution implementation missing symbol: ${symbol}`);
    }

    if (ownership.singleFeeAuthority) {
      const symbol = ownership.singleFeeAuthority.split('.').pop();
      assertCondition(source.includes(symbol), `execution implementation missing fee authority: ${symbol}`);
    }

    const migrationDebt = structure.migration && structure.migration.debt;
    if (ownership.targetRequestMethod && (!migrationDebt || migrationDebt.length === 0)) {
      const symbol = ownership.targetRequestMethod.split('.').pop();
      assertCondition(source.includes(symbol), `execution implementation missing target request method: ${symbol}`);
    }
  }
}

function validateMigrationDebt(structure, options) {
  const debt = structure.migration && structure.migration.debt;
  if (debt === undefined) return [];

  assertCondition(Array.isArray(debt), 'structure migration.debt must be an array');

  return debt.map((entry) => {
    assertCondition(entry && typeof entry.id === 'string' && entry.id.length > 0, 'migration debt has item without id');
    assertCondition(typeof entry.status === 'string' && entry.status.length > 0, `migration debt ${entry.id} missing status`);
    assertCondition(typeof entry.runtimeFile === 'string' && entry.runtimeFile.length > 0, `migration debt ${entry.id} missing runtimeFile`);
    assertCondition(typeof entry.targetDispatch === 'string' && entry.targetDispatch.length > 0, `migration debt ${entry.id} missing targetDispatch`);
    assertCondition(
      Array.isArray(entry.currentRuntimeDispatches),
      `migration debt ${entry.id} currentRuntimeDispatches must be an array`
    );

    const runtimePath = assertFileExists(options.repoRoot, entry.runtimeFile, `migration debt runtimeFile for ${entry.id}`);
    const source = fs.readFileSync(runtimePath, 'utf8');
    const presentDispatches = entry.currentRuntimeDispatches.filter((dispatch) => {
      const symbol = dispatch.includes('.') ? dispatch.split('.').pop() : dispatch;
      return source.includes(dispatch) || source.includes(symbol);
    });

    return {
      id: entry.id,
      status: entry.status,
      runtimeFile: entry.runtimeFile,
      targetDispatch: entry.targetDispatch,
      currentRuntimeDispatches: entry.currentRuntimeDispatches,
      presentDispatches,
    };
  });
}

function validateArchitecture(options) {
  assertCondition(options && options.repoRoot, 'validateArchitecture requires repoRoot');
  assertCondition(options.artifactPath, 'validateArchitecture requires artifactPath');
  assertCondition(options.structurePath, 'validateArchitecture requires structurePath');

  const artifact = readJson(path.join(options.repoRoot, options.artifactPath));
  const structure = readJson(path.join(options.repoRoot, options.structurePath));

  validateArtifactContract(artifact, options);
  validateStructureContract(artifact, structure, options);
  const migrationDebt = validateMigrationDebt(structure, options);

  if (!options.silent) {
    console.log('ok - architecture artifact graph is valid');
    console.log('ok - structure contract maps to artifact graph');
    console.log('ok - forbidden dependency edges are absent from structure');
    console.log('ok - declared implementation authorities exist');
    console.log('ok - governed authority contracts and conformance sources exist');
    for (const debt of migrationDebt) {
      console.log(
        `debt - ${debt.id}: ${debt.runtimeFile} still has ${debt.presentDispatches.join(', ') || 'no declared runtime dispatches present'}; target ${debt.targetDispatch}`
      );
    }
  }

  return { artifact, structure, migrationDebt };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    args[arg.slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  try {
    validateArchitecture({
      repoRoot: path.resolve(args.repoRoot || process.cwd()),
      artifactPath: args.artifact,
      structurePath: args.structure,
      artifactPathForContract: args.artifactContract || args.artifact,
      structurePathForContract: args.structureContract || args.structure,
    });
  } catch (err) {
    console.error(`not ok - ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  validateArtifactContract,
  validateArchitecture,
};
