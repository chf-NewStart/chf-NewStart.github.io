/* Authored conceptual physics. No questions or personal notes are sent to a service. */
(function (root, factory) {
  const questions = factory();
  if (typeof module === 'object' && module.exports) module.exports = questions;
  if (root) root.TendReasoningContent = questions;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const QUESTIONS = [
    {
      id: 'quiet-book', title: 'A quiet book', concept: 'Forces', diagram: 'book',
      prompt: 'A book rests on a table. How does the upward force from the table compare with the book’s weight?',
      conditions: ['The table is horizontal and the book remains at rest.', 'Gravity and the table’s contact force are the only vertical forces on the book.'],
      check: {constant: 'The book’s velocity stays zero.', forces: 'Earth pulls down; the table pushes up.', equilibrium: 'Compare the vertical forces on the book itself.'},
      options: [
        {id: 'equal', text: 'Equal to its weight', feedback: 'Yes. The two vertical forces balance while the book stays at rest.'},
        {id: 'greater', text: 'Greater than its weight', feedback: 'A little extra upward force can sound necessary to support something. But an unbalanced upward force would accelerate the book.'},
        {id: 'zero', text: 'Zero, because the book is still', feedback: 'Being still means the net force is zero. Individual forces can still act and balance one another.'}
      ],
      answer: 'equal',
      hints: ['Look for a change in velocity, rather than motion alone.', 'If the upward force were greater than the downward force, what would the book do?', 'Zero acceleration requires zero net force: upward contact force minus weight equals zero.'],
      explanation: ['Gravity pulls the book downward with its weight.', 'The table exerts an upward normal force. The book has no vertical acceleration.', 'The forces therefore have equal magnitudes and opposite directions. Stillness does not mean an absence of forces.'],
      changes: 'An extra hand force, an inclined surface, or vertical acceleration would change the contact force needed.',
      sources: [{title: 'OpenStax University Physics, 5.6: Common Forces', url: 'https://openstax.org/books/university-physics-volume-1/pages/5-6-common-forces'}],
      variation: {
        prompt: 'Now a hand presses downward on the book while it remains at rest. How does the table’s upward force compare with the book’s weight?',
        conditions: ['The table remains horizontal.', 'The hand adds a nonzero downward force; the book does not accelerate.'],
        check: {constant: 'The book’s velocity remains zero.', forces: 'Include gravity, the hand, and the table.', equilibrium: 'The table must balance all downward forces on the book.'},
        hints: ['The hand has added a force, not extra mass to the book.', 'Add the two downward forces before comparing them with the table force.'],
        options: [
          {id: 'greater', text: 'Greater than its weight', feedback: 'The table balances both weight and the hand’s downward force.'},
          {id: 'equal', text: 'Equal to its weight', feedback: 'That balanced gravity before the hand was added. The hand now adds another downward force.'},
          {id: 'less', text: 'Less than its weight', feedback: 'The hand pushes down, so a smaller upward force could not maintain rest.'}
        ], answer: 'greater',
        explanation: ['The book still has zero net vertical force.', 'The table’s force equals the book’s weight plus the downward hand force, so it is greater than weight alone.']
      }
    },
    {
      id: 'turn-the-block', title: 'Turn the block', concept: 'Pressure', diagram: 'pressure',
      prompt: 'The same block can rest on a broad face or a smaller face. Which position produces greater average pressure on the surface beneath it?',
      conditions: ['The rigid block is at rest on a horizontal surface, with no extra load.', 'Each face makes full contact when used as the base.', 'Compare average pressure: total normal force divided by contact area.'],
      check: {constant: 'The block’s mass, weight, and total supporting force do not change.', forces: 'Gravity is balanced by the surface’s contact force.', equilibrium: 'The total vertical force balances in either orientation.'},
      options: [
        {id: 'small', text: 'The smaller face', feedback: 'The same supporting force is concentrated over less area.'},
        {id: 'broad', text: 'The broad face', feedback: 'A broad face touches more surface, but that spreads the same force more thinly.'},
        {id: 'same', text: 'They produce the same pressure', feedback: 'The total supporting force is the same. Pressure also depends on the area over which that force acts.'}
      ], answer: 'small',
      hints: ['Turning the block does not change its weight.', 'Separate total force from force per unit area.', 'Average pressure is force divided by area. A smaller denominator gives greater pressure.'],
      explanation: ['The surface supports the same weight in both orientations.', 'Average contact pressure is supporting force divided by contact area.', 'The smaller face therefore produces greater average pressure, although the total force stays the same.'],
      changes: 'Changing the load or the actual contact area changes pressure. Real surfaces can have uneven local pressures; this question compares averages.',
      sources: [{title: 'OpenStax University Physics, 14.1: Fluids, Density, and Pressure', url: 'https://openstax.org/books/university-physics-volume-1/pages/14-1-fluids-density-and-pressure'}],
      variation: {
        prompt: 'Keep the contact area fixed and place an identical second block on top. What happens to the average pressure on the surface below?',
        conditions: ['Both blocks are at rest.', 'The lower block’s contact area stays the same.'],
        check: {constant: 'The area touching the surface is fixed.', forces: 'The surface now supports the weight of two identical blocks.', equilibrium: 'The upward support balances the combined weight.'},
        hints: ['What happens to the total load?', 'Use the new force and the unchanged area.'],
        options: [
          {id: 'double', text: 'It doubles', feedback: 'Twice the force over the same area gives twice the average pressure.'},
          {id: 'same', text: 'It stays the same', feedback: 'The area is unchanged, but the force on it has doubled.'},
          {id: 'half', text: 'It halves', feedback: 'Adding weight increases the supporting force; it does not spread that force over more area.'}
        ], answer: 'double', explanation: ['The total weight and supporting force double.', 'With unchanged contact area, average pressure doubles.']
      }
    },
    {
      id: 'connected-vessels', title: 'Water finds a level', concept: 'Pressure', diagram: 'vessels',
      prompt: 'A narrow vessel and a wide vessel are connected at the bottom. Once the water settles, how do their water surface heights compare?',
      conditions: ['Both vessels contain the same connected water of uniform density.', 'Both surfaces are open to the same atmospheric pressure.', 'Water is at rest; ignore capillary effects and surface tension.'],
      check: {constant: 'Water density and pressure above both surfaces are the same.', forces: 'Gravity and pressure forces act on the water.', equilibrium: 'Pressure at the same depth in connected stationary water must agree.'},
      options: [
        {id: 'same', text: 'The surfaces have the same height', feedback: 'Equal surface pressures and equal density require equal water depths above a common level.'},
        {id: 'wide', text: 'The wide vessel has a higher surface', feedback: 'The wide vessel can hold more water, but volume alone does not set hydrostatic pressure.'},
        {id: 'narrow', text: 'The narrow vessel has a higher surface', feedback: 'Narrowness can matter for capillary rise, which is explicitly neglected here.'}
      ], answer: 'same',
      hints: ['Imagine comparing pressure on both sides of the bottom connection.', 'Water pressure rises with vertical depth, not with the vessel’s width.', 'With equal pressure at the surfaces, unequal heights would leave a pressure difference that moves water.'],
      explanation: ['Both free surfaces start from the same atmospheric pressure.', 'At the bottom connection, each side adds pressure from the water depth above it.', 'Equal bottom pressure requires equal surface heights. Different widths can still give different water volumes.'],
      changes: 'Different pressures above the surfaces, different fluids, or appreciable capillary effects can produce unequal heights.',
      sources: [{title: 'OpenStax University Physics, 14.2: Measuring Pressure', url: 'https://openstax.org/books/university-physics-volume-1/pages/14-2-measuring-pressure'}],
      variation: {
        prompt: 'Now a sealed air space above the narrow side is kept at a higher pressure than the air above the wide side. At equilibrium, which water surface is lower?',
        conditions: ['The water remains connected and has uniform density.', 'Ignore capillary effects.', 'The higher air pressure is maintained after the water settles.', 'The pressure difference is small enough that both surfaces stay inside their vessels, the connection stays underwater, and no water overflows.'],
        check: {constant: 'The water density is unchanged.', forces: 'The pressure above the narrow side now pushes more strongly.', equilibrium: 'Bottom pressures still have to match, including the unequal surface pressures.'},
        hints: ['Include the air pressure above each column.', 'Higher surface pressure needs less water depth to reach the same bottom pressure.'],
        options: [
          {id: 'narrow', text: 'The narrow side', feedback: 'Its greater air pressure is balanced by a smaller water depth.'},
          {id: 'wide', text: 'The wide side', feedback: 'The extra pressure acts above the narrow side, pushing its surface downward.'},
          {id: 'same', text: 'They remain at the same height', feedback: 'Equal heights would now give unequal pressures at the connection because the air pressures differ.'}
        ], answer: 'narrow', explanation: ['Pressure at the connection equals surface pressure plus the water’s pressure contribution.', 'The side with higher surface pressure must have less water depth above the connection, so its surface is lower.']
      }
    },
    {
      id: 'half-a-material', title: 'Half a material', concept: 'Density', diagram: 'density',
      prompt: 'A uniform solid block is cut into two equal pieces. How does each piece’s density compare with the original block’s density?',
      conditions: ['The material is uniform throughout, with no cavities.', 'Cutting does not change the temperature or compress the material.', 'Compare mass divided by volume for each piece.'],
      check: {constant: 'The material and its physical state stay the same.', forces: 'No continuing compression or stretching changes its volume.', equilibrium: 'This is a ratio comparison; no new force equilibrium is needed.'},
      options: [
        {id: 'same', text: 'The same density', feedback: 'Each piece has half the mass and half the volume, so their ratio is unchanged.'},
        {id: 'half', text: 'Half the density', feedback: 'The mass halves, but so does the volume. Density is a ratio of both.'},
        {id: 'double', text: 'Twice the density', feedback: 'A smaller piece is not necessarily more tightly packed. Cutting removes volume and mass together.'}
      ], answer: 'same',
      hints: ['Write density as mass divided by volume.', 'What happens to both the numerator and denominator?', 'Half the mass divided by half the volume gives the original ratio.'],
      explanation: ['Density describes mass per unit volume, rather than total mass.', 'Each uniform half has half the original mass and half the original volume.', 'The mass-to-volume ratio, and therefore the density, stays the same.'],
      changes: 'Pieces of a nonuniform composite can have different densities. Compression, temperature changes, or phase changes can also alter density.',
      sources: [{title: 'OpenStax University Physics, 14.1: Density', url: 'https://openstax.org/books/university-physics-volume-1/pages/14-1-fluids-density-and-pressure'}],
      variation: {
        prompt: 'A sample is compressed to half its original volume without losing any mass. How does its density change?',
        conditions: ['The final volume is exactly half the initial volume.', 'No material enters or leaves.'],
        check: {constant: 'Mass is fixed.', forces: 'External compression changes the volume.', equilibrium: 'Compare the initial and final mass-to-volume ratios.'},
        hints: ['This time, the numerator stays fixed.', 'Divide the same mass by half the volume.'],
        options: [
          {id: 'double', text: 'It doubles', feedback: 'The same mass now occupies half as much volume.'},
          {id: 'same', text: 'It stays the same', feedback: 'Unlike cutting a uniform material, compression changes volume without removing mass.'},
          {id: 'half', text: 'It halves', feedback: 'Reducing volume at fixed mass increases mass per unit volume.'}
        ], answer: 'double', explanation: ['Density equals mass divided by volume.', 'Keeping mass fixed while halving volume doubles that ratio.']
      }
    },
    {
      id: 'heavy-and-light-underwater', title: 'Heavy and light underwater', concept: 'Buoyancy', diagram: 'submerged',
      prompt: 'Two sealed objects have the same exterior volume but different masses. Both are held completely underwater. Which feels the greater buoyant force?',
      conditions: ['Both objects are rigid, watertight, and completely submerged in the same uniform water.', 'Neither touches a wall or the bottom; neither traps extra exterior air.', 'Compare buoyant force alone, not weight or the force needed to hold each object.'],
      check: {constant: 'The displaced water volumes and water density are equal.', forces: 'Weight, buoyancy, and the holding force can act on each object.', equilibrium: 'The holding forces can differ even when buoyant forces are equal.'},
      options: [
        {id: 'same', text: 'They feel equal buoyant forces', feedback: 'They displace the same volume of the same water.'},
        {id: 'heavy', text: 'The heavier object', feedback: 'It has greater weight, but buoyancy is set by displaced fluid rather than the object’s mass.'},
        {id: 'light', text: 'The lighter object', feedback: 'A lighter object may be easier to support or more likely to rise. That compares buoyancy with weight, not buoyancy alone.'}
      ], answer: 'same',
      hints: ['Separate buoyant force from the net force.', 'How much water is displaced by each completely submerged object?', 'Buoyancy equals the weight of displaced water: equal water volumes give equal forces.'],
      explanation: ['Each completely submerged object displaces water equal to its exterior volume.', 'Archimedes’ principle sets buoyancy equal to the displaced water’s weight.', 'Their buoyant forces match. Their different weights mean the forces needed to hold them can differ.'],
      changes: 'Different submerged volumes or fluid densities change buoyancy. Contact with the bottom can invalidate this simple displacement argument.',
      sources: [{title: 'Harvard Natural Sciences Lecture Demonstrations: Buoyant Force Measurement', url: 'https://sciencedemonstrations.fas.harvard.edu/presentations/buoyant-force-measurement'}],
      variation: {
        prompt: 'One rigid object is held fully submerged first near the surface and then deeper in the same water. Does its buoyant force change?',
        conditions: ['Water density is uniform at both depths.', 'The object’s volume stays fixed and it touches no boundary.', 'It remains fully submerged in both positions.'],
        check: {constant: 'The object displaces the same water volume at both depths.', forces: 'Water pressure increases on both the top and bottom as the object goes deeper.', equilibrium: 'Compare the net upward pressure force, not pressure at only one point.'},
        hints: ['Does going deeper change the amount of displaced water?', 'Pressure rises everywhere on the object; compare the resulting net force.'],
        options: [
          {id: 'same', text: 'It stays the same', feedback: 'The same volume of water with the same density has the same weight.'},
          {id: 'greater', text: 'It becomes greater', feedback: 'Absolute pressure is greater deeper down, but the pressure difference producing buoyancy is unchanged for this fixed volume.'},
          {id: 'less', text: 'It becomes smaller', feedback: 'Greater pressure above the object is accompanied by greater pressure below it. The displaced water weight is unchanged.'}
        ], answer: 'same', explanation: ['Buoyancy equals water density times displaced volume times gravity.', 'All three are unchanged, so the buoyant force is unchanged.']
      }
    },
    {
      id: 'fresh-and-salt', title: 'Fresh water, salt water', concept: 'Buoyancy', diagram: 'floating',
      prompt: 'A floating block is moved from fresh water to denser saltwater. Once it settles, how much of the block is underwater?',
      conditions: ['The same rigid, nonabsorbing block floats freely in both liquids.', 'It touches no support, and its mass and volume stay fixed.', 'Saltwater has greater density; ignore surface tension and buoyancy from air.'],
      check: {constant: 'The block’s weight stays the same.', forces: 'Buoyancy acts up and weight acts down.', equilibrium: 'A freely floating block settles when buoyancy balances its weight.'},
      options: [
        {id: 'less', text: 'Less of it is underwater in saltwater', feedback: 'Denser water supplies the needed displaced weight in less volume.'},
        {id: 'more', text: 'More of it is underwater in saltwater', feedback: 'The denser liquid can support the same weight with less displacement, so the block rises rather than sinks farther.'},
        {id: 'same', text: 'The same amount is underwater', feedback: 'The block’s weight is unchanged, but the weight of each unit of displaced liquid has increased.'}
      ], answer: 'less',
      hints: ['The block needs the same upward force in both liquids.', 'Compare the weight of equal volumes of fresh water and saltwater.', 'A smaller volume of denser water can have the same weight as a larger volume of fresh water.'],
      explanation: ['At rest, the floating block’s buoyancy equals its unchanged weight.', 'Buoyancy equals the displaced liquid’s weight.', 'Denser saltwater needs less displaced volume to provide that force, so less of the block is submerged. The final buoyant force is the same.'],
      changes: 'Adding mass increases displacement. A block that absorbs liquid or touches a support needs a different analysis.',
      sources: [{title: 'OpenStax University Physics, 14.4: Archimedes’ Principle and Buoyancy', url: 'https://openstax.org/books/university-physics-volume-1/pages/14-4-archimedes-principle-and-buoyancy'}],
      variation: {
        prompt: 'A small weight is placed on top of the floating block in fresh water. Does the block displace more, less, or the same volume of water?',
        conditions: ['The block still floats freely and remains watertight.', 'The added weight stays above water.', 'Water density stays the same.'],
        check: {constant: 'Water density is fixed.', forces: 'Water must now support the block and the added weight.', equilibrium: 'Buoyancy balances their combined weight.'},
        hints: ['The supported weight has increased.', 'At fixed liquid density, more buoyancy needs more displacement.'],
        options: [
          {id: 'more', text: 'More water', feedback: 'It settles lower until the extra displaced water supplies the extra buoyancy.'},
          {id: 'less', text: 'Less water', feedback: 'Less displacement would reduce buoyancy while the supported weight has increased.'},
          {id: 'same', text: 'The same volume', feedback: 'The original displacement supported only the original load.'}
        ], answer: 'more', explanation: ['The block and weight together require a greater upward force.', 'The block sinks a little farther, displacing more water until buoyancy matches the combined weight.']
      }
    },
    {
      id: 'melting-ice', title: 'A melting ice cube', concept: 'Buoyancy', diagram: 'ice',
      prompt: 'A pure ice cube floats in pure water. When it has completely melted, what happens to the water level?',
      conditions: ['The ice floats freely and contains no trapped objects or air cavities.', 'No water is added, removed, or evaporated.', 'Ignore surface tension, temperature-driven volume changes of the water and container, and buoyancy from air.'],
      check: {constant: 'The mass of the ice becomes the same mass of liquid water.', forces: 'Initially, buoyancy balances the floating ice’s weight.', equilibrium: 'Compare the ice’s initial displacement with its eventual meltwater volume.'},
      options: [
        {id: 'same', text: 'It stays at the same level', feedback: 'The meltwater occupies the volume of water that the floating ice had displaced.'},
        {id: 'rise', text: 'It rises', feedback: 'The part of the ice above the surface can suggest extra water. But the ice already displaces water equal to its entire weight.'},
        {id: 'fall', text: 'It falls', feedback: 'Ice occupies more total volume than its meltwater, but only its submerged portion displaced water before melting.'}
      ], answer: 'same',
      hints: ['A floating object displaces its own weight of liquid.', 'Compare the mass of displaced water with the mass of the ice.', 'After melting, that same mass becomes water of the same density as the water it displaced.'],
      explanation: ['Floating ice displaces a mass of water equal to its own mass.', 'When the ice melts, the same mass becomes liquid water.', 'That meltwater fills exactly the prior displaced volume, leaving the level unchanged under the stated conditions.'],
      changes: 'Ice initially supported above the water adds new volume when its meltwater enters. Salinity differences, trapped objects, or thermal expansion also change the setup.',
      sources: [{title: 'MIT OpenCourseWare, Classical Mechanics: Chapter 27, Static Fluids', url: 'https://www.ocw.mit.edu/courses/8-01sc-classical-mechanics-fall-2016/mit8_01scs22_chapter27.pdf'}],
      variation: {
        prompt: 'Instead, the ice starts on a support above the water. All of its meltwater drips into the vessel. What happens to the level?',
        conditions: ['The support is outside the water and does not move or displace it.', 'The initial ice never touches the water.', 'The vessel has room for all the meltwater without overflowing.', 'Ignore evaporation and temperature-driven volume changes.'],
        check: {constant: 'The original water remains in the vessel.', forces: 'The support initially carries the ice’s weight.', equilibrium: 'The ice initially contributes no water displacement.'},
        hints: ['Was any water displaced by the ice initially?', 'The meltwater now adds liquid that was previously outside the water.'],
        options: [
          {id: 'rise', text: 'It rises', feedback: 'The meltwater adds volume without replacing any initial ice displacement.'},
          {id: 'same', text: 'It stays the same', feedback: 'The floating-ice cancellation relied on an initial displacement, which is absent here.'},
          {id: 'fall', text: 'It falls', feedback: 'No original water leaves, and additional liquid enters the vessel.'}
        ], answer: 'rise', explanation: ['The supported ice initially displaces no water.', 'Its meltwater adds liquid volume, so the level rises.']
      }
    },
    {
      id: 'warm-gas-equal-pressure', title: 'Warm gas, equal pressure', concept: 'Density', diagram: 'gas-open',
      prompt: 'Two samples of the same gas have equal pressure. One is hotter. Which sample has greater density?',
      conditions: ['Both samples behave as an ideal gas and have the same molecular composition.', 'Their absolute pressures are equal; their temperatures are different.', 'Compare mass per unit volume, not the total mass of the samples.'],
      check: {constant: 'Pressure and molecular mass are equal in this comparison.', forces: 'Gas pressure reflects molecular impacts on a boundary.', equilibrium: 'Compare two settled states; do not assume a sealed rigid container.'},
      options: [
        {id: 'cold', text: 'The colder sample', feedback: 'At equal pressure, the colder ideal gas has more mass per unit volume.'},
        {id: 'hot', text: 'The hotter sample', feedback: 'Hotter molecules move faster. At the same pressure, fewer molecules per unit volume are needed, so density is lower.'},
        {id: 'same', text: 'Their densities are equal', feedback: 'Same composition does not fix gas density; pressure and temperature both matter.'}
      ], answer: 'cold',
      hints: ['Equal pressure is an essential condition here.', 'Faster molecules can provide the same pressure with fewer molecules in each unit of volume.', 'For the same ideal gas, density equals pressure × molar mass ÷ (gas constant × absolute temperature).'],
      explanation: ['For the same ideal gas, pressure links density and absolute temperature.', 'At a fixed pressure, raising absolute temperature lowers the needed mass per unit volume.', 'The colder sample is therefore denser. This does not say that heating every container lowers its gas density.'],
      changes: 'In a sealed rigid container, mass and volume stay fixed, so heating raises pressure instead of lowering density. Different gas compositions also require their molecular masses.',
      sources: [{title: 'OpenStax College Physics, 13.3: The Ideal Gas Law', url: 'https://openstax.org/books/college-physics/pages/13-3-the-ideal-gas-law'}],
      variation: {
        prompt: 'Two samples of the same ideal gas now have equal temperature. Sample A has twice sample B’s absolute pressure. How do their densities compare?',
        conditions: ['The molecular composition is the same.', 'Both samples are in settled states at the same absolute temperature.'],
        check: {constant: 'Temperature and molecular mass are equal.', forces: 'The pressure comparison now changes rather than the temperature.', equilibrium: 'Use the relation between density, pressure, and absolute temperature.'},
        hints: ['At fixed temperature, pressure is proportional to the number of molecules per volume.', 'The same molecular mass makes mass density follow that number density.'],
        options: [
          {id: 'double', text: 'A has twice the density', feedback: 'At fixed temperature and composition, density is proportional to absolute pressure.'},
          {id: 'half', text: 'A has half the density', feedback: 'Higher pressure at the same temperature requires more molecules per volume, not fewer.'},
          {id: 'same', text: 'They have the same density', feedback: 'Equal temperature alone does not fix density when pressures differ.'}
        ], answer: 'double', explanation: ['For a fixed gas composition, density is proportional to pressure divided by absolute temperature.', 'The temperature is unchanged and the pressure doubles, so density doubles.']
      }
    },
    {
      id: 'sealed-rigid-gas', title: 'A sealed, rigid container', concept: 'Pressure', diagram: 'gas-rigid',
      prompt: 'A fixed mass of gas is heated in a sealed, rigid container. Once its temperature is uniform again, what changes?',
      conditions: ['The gas behaves ideally, with no chemical reaction or phase change.', 'No gas enters or leaves, and the container’s volume stays fixed.', 'The final absolute temperature is higher.'],
      check: {constant: 'Both the gas mass and the container volume stay fixed.', forces: 'The rigid walls prevent expansion while molecular impacts create pressure.', equilibrium: 'Compare the initial and final uniform states.'},
      options: [
        {id: 'pressure', text: 'Pressure rises; density stays the same', feedback: 'Fixed mass and volume fix density. Heating raises ideal-gas pressure at that fixed volume.'},
        {id: 'density', text: 'Density falls; pressure stays the same', feedback: 'That can describe heating at maintained pressure with room to expand. This container cannot expand or lose gas.'},
        {id: 'both', text: 'Pressure and density both rise', feedback: 'Pressure rises, but no extra mass is added and no volume is removed, so density cannot rise.'}
      ], answer: 'pressure',
      hints: ['Begin with density: mass divided by volume.', 'Neither mass nor volume can change in this setup.', 'With fixed gas amount and volume, the ideal gas law makes absolute pressure proportional to absolute temperature.'],
      explanation: ['The seal fixes gas mass; the rigid walls fix its volume.', 'Density is mass divided by volume, so it stays unchanged.', 'The hotter gas has greater absolute pressure. The conditions differ from an equal-pressure comparison.'],
      changes: 'A movable piston can allow expansion at maintained pressure. A leak can change gas mass. Temperature ratios in the ideal gas law must use kelvin.',
      sources: [{title: 'OpenStax University Physics, 2.1: Molecular Model of an Ideal Gas', url: 'https://openstax.org/books/university-physics-volume-2/pages/2-1-molecular-model-of-an-ideal-gas'}],
      variation: {
        prompt: 'Replace the rigid lid with a freely moving piston that maintains constant pressure. Heat the same sealed mass of ideal gas. What happens to its volume and density?',
        conditions: ['The piston moves without friction and maintains the same external pressure.', 'No gas enters or leaves.', 'Compare initial and final settled states at higher final temperature.'],
        check: {constant: 'Gas mass and pressure are fixed; volume is free to change.', forces: 'Gas pressure balances the constant external piston load at each settled state.', equilibrium: 'The piston settles at a new volume with the same pressure.'},
        hints: ['The constraint has changed from fixed volume to fixed pressure.', 'At fixed pressure and gas amount, ideal-gas volume follows absolute temperature.'],
        options: [
          {id: 'expand', text: 'Volume rises; density falls', feedback: 'The same mass expands as temperature rises at constant pressure.'},
          {id: 'rigid', text: 'Volume and density stay fixed', feedback: 'The piston can move, so the rigid-container constraint no longer applies.'},
          {id: 'shrink', text: 'Volume falls; density rises', feedback: 'At maintained pressure, heating an ideal gas expands it rather than compressing it.'}
        ], answer: 'expand', explanation: ['At constant pressure and fixed gas amount, volume is proportional to absolute temperature.', 'The volume increases while mass remains fixed, so density decreases.']
      }
    },
    {
      id: 'connected-balloons', title: 'Two connected balloons', concept: 'Pressure', diagram: 'balloons',
      prompt: 'Two real rubber balloons have different sizes. A tube connects them through a closed valve. From their sizes alone, which way will air initially flow when the valve opens?',
      conditions: ['Both contain air at the same temperature and are at the same elevation.', 'There are no leaks or pumps.', 'Their internal pressures, elastic response, and inflation history are not given.'],
      check: {constant: 'Total air is conserved, but either balloon’s volume can change.', forces: 'Gas pressure is balanced by outside pressure and stretched rubber.', equilibrium: 'At settled connected equilibrium, pressures match at the same height; volumes need not match.'},
      options: [
        {id: 'unknown', text: 'Not enough information', feedback: 'Sizes alone do not determine the pressures of real rubber balloons.'},
        {id: 'small', text: 'Always from the smaller balloon to the larger', feedback: 'That occurs for some inflation states, but real rubber’s changing elastic response makes it no universal rule.'},
        {id: 'large', text: 'Always from the larger balloon to the smaller', feedback: 'A larger volume need not mean a higher pressure. Rubber elasticity and initial inflation matter.'}
      ], answer: 'unknown',
      hints: ['Initial flow responds to a pressure difference, rather than a size difference by itself.', 'Stretching rubber changes its tension. A real balloon is not a soap bubble with constant surface tension.', 'Without pressures or enough information about the membranes and their inflation states, either initial direction can be possible.'],
      explanation: ['At the same temperature and elevation, a pressure difference drives initial flow from higher internal pressure toward lower pressure.', 'For real rubber, pressure depends on elasticity and inflation state; a bigger balloon can have either the higher or the lower pressure.', 'Sizes alone cannot determine the result. If pressures already match, no initial flow is needed despite unequal sizes. Connected equilibrium requires equal pressure, not generally equal volumes.'],
      changes: 'Pressure measurements at the moment of opening determine the initial direction. They do not by themselves determine the final sizes; that also requires membrane behavior.',
      sources: [{title: 'Levin and da Silveira: To grow or to shrink: A tale of two rubber balloons', url: 'https://arxiv.org/abs/cond-mat/0403171'}],
      variation: {
        prompt: 'Now measurements show 104 kPa inside the smaller balloon and 102 kPa inside the larger one just before opening. Which way does air initially flow?',
        conditions: ['The pressures are absolute pressures measured at the same elevation.', 'Both balloons contain the same air at the same temperature.', 'There are no leaks or pumps; ask only about initial flow, not final volumes.'],
        check: {constant: 'Temperature and elevation are equal.', forces: 'There is now a measured pressure difference.', equilibrium: 'Initial flow responds to that difference; final sizes remain a separate question.'},
        hints: ['The missing pressure information is now supplied.', 'Compare 104 kPa with 102 kPa, rather than comparing balloon sizes.'],
        options: [
          {id: 'small', text: 'From smaller to larger', feedback: 'The smaller balloon has the higher measured pressure in this particular setup.'},
          {id: 'large', text: 'From larger to smaller', feedback: 'Its larger size does not override the measured lower pressure.'},
          {id: 'unknown', text: 'The initial direction is still unknown', feedback: 'The pressure measurements resolve the initial direction. Final volumes would still need more information.'}
        ], answer: 'small', explanation: ['The measured pressure is higher in the smaller balloon.', 'Initial air flow is therefore from smaller to larger here. This particular result is not a universal size rule.']
      }
    },
    {
      id: 'hovering-helicopter', title: 'A hovering load', concept: 'Equilibrium', diagram: 'hover',
      prompt: 'A helicopter hovers with a load suspended below it. After swinging has stopped, what shape does the rope have?',
      conditions: ['The helicopter and load are stationary in still air.', 'The flexible rope is taut; neglect its mass and air drag.', 'Neglect rotor downwash, buoyancy, and air forces on the load.'],
      check: {constant: 'The load’s velocity remains zero.', forces: 'Only weight and rope tension act on the load in this model.', equilibrium: 'Balance horizontal and vertical forces separately.'},
      options: [
        {id: 'vertical', text: 'Straight and vertical', feedback: 'Tension balances weight with no horizontal force to balance.'},
        {id: 'tilted', text: 'Straight but tilted', feedback: 'A tilt would give the tension a horizontal component, but no opposing horizontal force is present.'},
        {id: 'curved', text: 'Curved to one side', feedback: 'This ideal rope has no distributed weight or air drag to produce a curve, and the load has no sideways force.'}
      ], answer: 'vertical',
      hints: ['Focus on the forces acting on the load, not on the helicopter’s rotors.', 'If the rope tilted, what would balance its horizontal pull?', 'With only downward weight and upward tension, the tension is vertical. A massless, dragless taut rope is straight.'],
      explanation: ['The stationary load has zero net force. Its only forces are downward weight and tension along the rope.', 'Tension must be vertical to balance weight without creating an unbalanced sideways force.', 'A taut rope with negligible mass and no distributed air drag stays straight, so it hangs straight down.'],
      changes: 'Payload drag, acceleration, wind, downwash, or appreciable rope mass and drag require a different force analysis. Real ropes can curve when distributed loads act on them.',
      sources: [
        {title: 'OpenStax University Physics, 5.6: Tension', url: 'https://openstax.org/books/university-physics-volume-1/pages/5-6-common-forces'},
        {title: 'OpenStax University Physics, 5.3: Newton’s Second Law', url: 'https://openstax.org/books/university-physics-volume-1/pages/5-3-newtons-second-law'}
      ],
      variation: {
        prompt: 'The helicopter and load now accelerate together to the right, without swinging or vertical acceleration. Air forces are still negligible. How does the rope lie?',
        conditions: ['The horizontal acceleration is nonzero and to the right.', 'The load maintains a constant position relative to the accelerating helicopter.', 'The taut flexible rope has negligible mass and drag; ignore downwash and buoyancy.'],
        check: {constant: 'The vertical velocity is unchanged, but horizontal velocity is changing.', forces: 'Weight and tension act on the load.', equilibrium: 'Vertical forces balance; a net rightward force supplies horizontal acceleration.'},
        hints: ['Zero vertical acceleration does not mean zero horizontal acceleration.', 'The rope must pull both upward and to the right on the load.'],
        options: [
          {id: 'behind', text: 'Straight, with the load behind the helicopter', feedback: 'Tension can then pull upward and rightward on the load.'},
          {id: 'vertical', text: 'Straight and vertical', feedback: 'A vertical tension has no rightward component to accelerate the load.'},
          {id: 'curved', text: 'Curved backward', feedback: 'Acceleration tilts this ideal massless, dragless rope; distributed rope forces would be needed for curvature.'}
        ], answer: 'behind', explanation: ['The load needs a net force to the right as well as vertical support.', 'A straight rope tilted with the load behind the helicopter supplies that rightward tension component. Its angle satisfies tan(angle from vertical) = acceleration divided by g.']
      }
    },
    {
      id: 'steady-helicopter', title: 'A load in steady flight', concept: 'Forces', diagram: 'flight',
      prompt: 'A helicopter carries a load steadily to the right. The load feels air drag to the left. After swinging has stopped, how does the rope lie?',
      conditions: ['Helicopter and load move at constant velocity and constant height.', 'The payload has a nonzero horizontal drag force to the left.', 'The taut flexible rope has negligible mass and negligible drag of its own.', 'Ignore rotor downwash, buoyancy, and vertical air forces on the load.'],
      check: {constant: 'The load’s velocity stays constant, so its acceleration is zero.', forces: 'Weight acts down, payload drag acts left, and tension acts along the rope.', equilibrium: 'Both horizontal and vertical net forces must be zero.'},
      options: [
        {id: 'straight', text: 'Straight, with the load trailing behind', feedback: 'The tilted tension balances downward weight and backward payload drag.'},
        {id: 'vertical', text: 'Straight and vertical', feedback: 'Vertical tension could support weight but could not balance the specified horizontal payload drag.'},
        {id: 'curved', text: 'Curved backward', feedback: 'Payload drag tilts this ideal rope. Rope weight or rope drag could produce curvature, but both are neglected here.'}
      ], answer: 'straight',
      hints: ['Constant velocity requires zero net force, even though individual forces are present.', 'Tension must pull the load both upward and to the right.', 'With no distributed weight or drag on the rope, it stays straight; its angle provides the needed tension components.'],
      explanation: ['The load’s downward weight and leftward drag both need balancing because acceleration is zero.', 'Tension points up and right, so the load trails behind the helicopter.', 'With rope mass and rope drag neglected, tension does not change direction along the rope. It is straight and tilted, rather than curved.'],
      changes: 'With distributed rope weight or rope drag, a curved shape can result. During acceleration or swinging, the load’s net force need not be zero.',
      sources: [
        {title: 'OpenStax University Physics, 6.1: Solving Problems with Newton’s Laws', url: 'https://openstax.org/books/university-physics-volume-1/pages/6-1-solving-problems-with-newtons-laws'},
        {title: 'OpenStax University Physics, 5.7: Drawing Free-Body Diagrams', url: 'https://openstax.org/books/university-physics-volume-1/pages/5-7-drawing-free-body-diagrams'}
      ],
      variation: {
        prompt: 'Keep the same steady horizontal motion, but now neglect payload drag as well as rope drag. After all swinging has stopped, how does the rope lie?',
        conditions: ['Helicopter and load move at constant velocity and height.', 'All air forces on the load and rope are negligible.', 'The rope is taut and has negligible mass.'],
        check: {constant: 'The velocity remains constant.', forces: 'Only downward weight and rope tension act on the load.', equilibrium: 'There is no horizontal force for a tilted tension to balance.'},
        hints: ['Motion alone does not require a forward net force.', 'With no drag or acceleration, the horizontal tension component must be zero.'],
        options: [
          {id: 'vertical', text: 'Straight and vertical', feedback: 'The load needs vertical support and no horizontal force.'},
          {id: 'behind', text: 'Straight, with the load trailing behind', feedback: 'That tilt was needed to balance payload drag. The drag has now been removed.'},
          {id: 'curved', text: 'Curved backward', feedback: 'Neither distributed rope forces nor payload drag are present in this revised model.'}
        ], answer: 'vertical', explanation: ['Constant velocity does not require a forward force.', 'With only weight and tension on the load, they balance vertically and the ideal rope is straight and vertical.']
      }
    },
    {
      id: 'two-smooth-tracks', title: 'Two smooth tracks', concept: 'Energy', diagram: 'ramp',
      prompt: 'Two identical beads slide down differently shaped smooth tracks from the same height. Which has the greater speed at the bottom?',
      conditions: ['Both beads start from rest and descend through the same vertical height.', 'They slide without rotating on fixed frictionless tracks and remain in contact.', 'Ignore air resistance. Compare endpoint speed, not arrival time.'],
      check: {constant: 'Mass, starting speed, gravity, and vertical drop are equal.', forces: 'Gravity does work; each stationary track’s normal force is perpendicular to motion.', equilibrium: 'The beads accelerate; compare energy rather than assuming force balance.'},
      options: [
        {id: 'same', text: 'They have the same speed', feedback: 'They convert the same gravitational potential energy into kinetic energy.'},
        {id: 'steep', text: 'The one on the steeper track', feedback: 'Steepness changes acceleration and can change travel time. The final speed here follows the same vertical energy drop.'},
        {id: 'long', text: 'The one on the longer track', feedback: 'A longer distance does not create extra energy. Gravity’s total work depends on vertical drop.'}
      ], answer: 'same',
      hints: ['Set aside the time taken and compare the beginning and end.', 'How much gravitational potential energy does each bead lose?', 'With no dissipative work or rotation, the same loss of gravitational potential energy gives the same translational kinetic energy.'],
      explanation: ['Each bead loses the same gravitational potential energy, mass × g × vertical drop.', 'No energy goes into friction, air resistance, or rotation; the fixed track’s normal force does no work.', 'Both end with the same kinetic energy and speed. Their travel times need not match.'],
      changes: 'Friction, air resistance, rotation, moving tracks, different starting speeds, or different height drops can change the endpoint speed.',
      sources: [{title: 'OpenStax University Physics, 8.3: Conservation of Energy', url: 'https://openstax.org/books/university-physics-volume-1/pages/8-3-conservation-of-energy'}],
      variation: {
        prompt: 'One track now has friction that dissipates some energy; the other remains frictionless. Both beads still reach the bottom. Which finishes with greater speed?',
        conditions: ['The beads start from rest with the same vertical drop and do not rotate.', 'The rough track dissipates a nonzero amount of energy.', 'Both tracks are fixed; air resistance is negligible.'],
        check: {constant: 'The initial energy and gravitational energy drop remain equal.', forces: 'Friction now does negative work on one bead.', equilibrium: 'Account for energy dissipated instead of assuming mechanical energy is conserved on both tracks.'},
        hints: ['Both start with the same available gravitational energy.', 'Subtract the energy dissipated on the rough track from its final kinetic energy.'],
        options: [
          {id: 'smooth', text: 'The bead on the frictionless track', feedback: 'It keeps more of the available energy as kinetic energy.'},
          {id: 'rough', text: 'The bead on the rough track', feedback: 'Friction removes mechanical energy; it cannot supply extra endpoint kinetic energy here.'},
          {id: 'same', text: 'They still have the same speed', feedback: 'Equal height drops give equal available energy, but one bead now dissipates part of it.'}
        ], answer: 'smooth', explanation: ['Both lose the same gravitational potential energy.', 'The rough track dissipates some of that energy, leaving less kinetic energy and a lower endpoint speed than on the frictionless track.']
      }
    },
    {
      id: 'balanced-beam', title: 'A balanced beam', concept: 'Equilibrium', diagram: 'balance',
      prompt: 'A 1 kg mass hangs 2 m left of a beam’s pivot. A 2 kg mass hangs 1 m right of it. Released horizontally from rest, what does the beam do initially?',
      conditions: ['The rigid horizontal beam has negligible mass and a fixed frictionless pivot.', 'The distances are horizontal distances from the pivot to the hanging masses.', 'Gravity is uniform; no other turning forces act.'],
      check: {constant: 'Both masses feel the same gravitational acceleration.', forces: 'Each weight acts downward; the pivot provides support.', equilibrium: 'Compare clockwise and anticlockwise torque about the pivot.'},
      options: [
        {id: 'balance', text: 'It stays balanced', feedback: 'The two opposing weight × distance products are equal.'},
        {id: 'right', text: 'The heavier right side goes down', feedback: 'The heavier mass acts at a shorter distance. Weight alone does not determine its turning effect.'},
        {id: 'left', text: 'The longer left side goes down', feedback: 'The longer arm has a smaller weight. Distance alone does not determine torque.'}
      ], answer: 'balance',
      hints: ['A force farther from the pivot has a greater turning effect for the same force.', 'Compare weight multiplied by perpendicular distance on each side.', 'The left torque is 1 × g × 2; the right torque is 2 × g × 1.'],
      explanation: ['The turning effect, or torque, is weight multiplied by perpendicular distance from the pivot.', 'The left side produces 2g newton metres; the right side produces the same torque in the opposite direction.', 'The net torque is zero, so the beam released from rest remains balanced in this ideal model.'],
      changes: 'Changing either mass or arm length changes torque. A beam with appreciable mass needs its own weight and centre of mass included.',
      sources: [{title: 'OpenStax University Physics, 12.1: Conditions for Static Equilibrium', url: 'https://openstax.org/books/university-physics-volume-1/pages/12-1-conditions-for-static-equilibrium'}],
      variation: {
        prompt: 'Move the 2 kg mass from 1 m to 1.5 m right of the pivot. The 1 kg mass remains 2 m left. Released horizontally from rest, which side starts to fall?',
        conditions: ['The beam still has negligible mass and the fixed pivot is frictionless.', 'Gravity is uniform and no extra forces act.'],
        check: {constant: 'Masses, gravity, and the left arm stay the same.', forces: 'The same weights now act with a longer right lever arm.', equilibrium: 'Compare the new torques; balance is no longer guaranteed.'},
        hints: ['The right weight has not changed, but its turning distance has.', 'Compare 1 × g × 2 with 2 × g × 1.5.'],
        options: [
          {id: 'right', text: 'The right side', feedback: 'Its torque is now 3g, greater than the left side’s 2g.'},
          {id: 'left', text: 'The left side', feedback: 'The left arm is longer, but its smaller weight gives less torque than the revised right side.'},
          {id: 'balance', text: 'Neither; it remains balanced', feedback: 'Moving a weight outward increases its torque and breaks the earlier balance.'}
        ], answer: 'right', explanation: ['The left torque remains 2g newton metres.', 'The right torque becomes 3g newton metres, so the net torque starts the right side downward.']
      }
    }
  ];

  return QUESTIONS;
});
