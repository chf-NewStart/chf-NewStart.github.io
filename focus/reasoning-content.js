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

  // Preserve the original introductory bank and its IDs for practice and saved attempts.
  for (const item of QUESTIONS) item.introductory = true;

  // Carefully authored daily challenges combine principles; no runtime question generation.
  const DAILY_QUESTIONS = [
  {
    "id": "reasoning-ice-and-steel",
    "title": "The ice carries a passenger",
    "concept": "Buoyancy",
    "diagram": "ice-bead",
    "daily": true,
    "prompt": "A small steel bead is frozen into an ice cube. Together they float in a bowl of water. The ice melts and the bead sinks. Compared with the start, what happens to the water level?",
    "conditions": [
      "The whole ice-and-bead assembly initially floats freely; enough ice is present to support the bead.",
      "The ice and liquid are pure water. The steel is denser than water and ends fully submerged on the bottom.",
      "Ignore trapped air, evaporation, surface tension, and temperature-driven volume changes. Nothing overflows."
    ],
    "check": {
      "constant": "The masses of water and steel are conserved.",
      "forces": "Initially buoyancy supports both ice and steel; finally the bottom also supports the steel.",
      "equilibrium": "Compare the volume excluded from the liquid before and after, rather than just the ice’s size."
    },
    "options": [
      {
        "id": "falls",
        "text": "The level falls",
        "feedback": "Initially the bead makes the floating ice displace water equal to the bead’s weight; finally the bead displaces only its own smaller volume."
      },
      {
        "id": "same",
        "text": "The level stays the same",
        "feedback": "Melting pure floating ice alone leaves the level unchanged. Here the steel changes from a carried load to a submerged solid."
      },
      {
        "id": "rises",
        "text": "The level rises",
        "feedback": "The bead entering the water does displace water, but less than the extra displacement needed to carry its weight while floating."
      }
    ],
    "answer": "falls",
    "hints": [
      "First imagine the same ice without the bead. Its own melting would leave the level unchanged.",
      "While the bead is carried, its weight requires an extra volume of displaced water.",
      "Compare a bead’s own volume with the volume of water having the same weight. Steel is denser than water."
    ],
    "explanation": [
      "Initially the floating assembly displaces water whose weight equals the combined weight of ice and steel.",
      "The ice’s meltwater exactly replaces the displacement associated with the ice’s own mass.",
      "The bead initially requires displacement equal to its mass divided by water density. After sinking it occupies only its mass divided by steel density.",
      "That final bead volume is smaller, so the level falls."
    ],
    "changes": "A passenger that still floats independently after the ice melts would keep displacing its own weight of water, giving no level change under the same idealizations.",
    "sources": [
      {
        "title": "OpenStax University Physics, 14.4: Archimedes’ Principle and Buoyancy",
        "url": "https://openstax.org/books/university-physics-volume-1/pages/14-4-archimedes-principle-and-buoyancy"
      },
      {
        "title": "OpenStax University Physics, 14.1: Density and Pressure",
        "url": "https://openstax.org/books/university-physics-volume-1/pages/14-1-fluids-density-and-pressure"
      }
    ],
    "variation": {
      "prompt": "Change only the passenger: the bead is replaced by a small sealed, rigid plastic capsule that floats freely after the ice melts. What happens to the final water level?",
      "conditions": [
        "The original ice-and-capsule assembly floats freely.",
        "The capsule neither leaks nor changes volume or mass. Keep the other idealizations."
      ],
      "check": {
        "constant": "The combined mass is unchanged.",
        "forces": "Buoyancy supports all of the mass both before and after melting.",
        "equilibrium": "Compare total displacement of the initial assembly with the two final floating/liquid parts."
      },
      "hints": [
        "How much water must support a freely floating capsule?",
        "The final capsule still displaces water equal to its weight."
      ],
      "options": [
        {
          "id": "same",
          "text": "It stays the same",
          "feedback": "All of the mass is still accounted for by equal-weight displacement or meltwater."
        },
        {
          "id": "falls",
          "text": "It falls",
          "feedback": "That relied on a dense passenger sinking and displacing less than its own weight of water."
        },
        {
          "id": "rises",
          "text": "It rises",
          "feedback": "The capsule’s final displacement replaces the displacement that carried it before melting."
        }
      ],
      "answer": "same",
      "explanation": [
        "The ice’s mass becomes an equal volume of meltwater to its former water displacement.",
        "The floating capsule continues to displace its own weight of water. Their total leaves the level unchanged."
      ]
    }
  },
  {
    "id": "reasoning-two-scales",
    "title": "One object, two readings",
    "concept": "Forces",
    "diagram": "scales",
    "daily": true,
    "prompt": "A dense object hangs from a spring scale above a water beaker on a separate balance. Lower the object until it is fully underwater and motionless. How do the two force readings change?",
    "conditions": [
      "The spring scale is supported independently of the beaker and balance.",
      "The object is rigid and touches neither the beaker nor its bottom. The water does not overflow.",
      "Compare settled readings before immersion and after full immersion. Neglect air buoyancy and the string’s mass and volume."
    ],
    "check": {
      "constant": "The object’s weight and the total weight of the two supported systems are unchanged.",
      "forces": "Water pushes upward on the object; the object pushes downward on the water.",
      "equilibrium": "Each system is at rest, but the support forces can be redistributed."
    },
    "options": [
      {
        "id": "transfer",
        "text": "The spring reading falls and the beaker reading rises by the same force",
        "feedback": "The buoyant force transfers part of the support from the spring to the water and balance."
      },
      {
        "id": "bothless",
        "text": "Both readings fall",
        "feedback": "The object is partly supported by water, but that support has a downward reaction on the beaker system."
      },
      {
        "id": "beakersame",
        "text": "The spring reading falls; the beaker reading stays the same",
        "feedback": "No material enters the beaker, yet an additional downward contact force still acts on its water."
      }
    ],
    "answer": "transfer",
    "hints": [
      "Draw forces on the hanging object first. What supports it besides the spring?",
      "The water’s upward push has an equal downward reaction on the water.",
      "The spring loses exactly the support force that the beaker’s balance gains."
    ],
    "explanation": [
      "On the motionless object, spring tension plus buoyancy equals weight. The spring reading therefore falls by the buoyant force.",
      "By Newton’s third law, the object pushes downward on the water by that same force.",
      "The balance below the beaker supplies that extra support, so its reading rises by the same amount.",
      "The sum of the two force readings is unchanged; the support has moved between them."
    ],
    "changes": "If the object rests on the beaker bottom or the suspension is attached to the balance itself, the systems and force paths change. Overflow would also remove weight.",
    "sources": [
      {
        "title": "OpenStax University Physics, 14.4: Archimedes’ Principle and Buoyancy",
        "url": "https://openstax.org/books/university-physics-volume-1/pages/14-4-archimedes-principle-and-buoyancy"
      },
      {
        "title": "OpenStax University Physics, 5.5: Newton’s Third Law",
        "url": "https://openstax.org/books/university-physics-volume-1/pages/5-5-newtons-third-law"
      }
    ],
    "variation": {
      "prompt": "Now lower the object gently onto the bottom and let the string go slack, keeping the object fully underwater. Relative to the original reading before immersion, how much extra force does the beaker balance support?",
      "conditions": [
        "No water has overflowed. The object is stationary on the bottom.",
        "The external spring now supports none of the object’s weight."
      ],
      "check": {
        "constant": "The object’s weight is unchanged.",
        "forces": "Water and bottom contact together support the object.",
        "equilibrium": "The balance supports the beaker, water, and the object through both contact paths."
      },
      "hints": [
        "Do not count buoyancy as an extra force from outside the combined system.",
        "All of the object’s weight now reaches the same balance."
      ],
      "options": [
        {
          "id": "weight",
          "text": "The object’s full weight",
          "feedback": "Both the water’s reaction and the object’s bottom-contact force reach the balance."
        },
        {
          "id": "buoyancy",
          "text": "Only the buoyant force",
          "feedback": "That described the suspended case; bottom contact now carries the remaining weight."
        },
        {
          "id": "weightplus",
          "text": "Its weight plus the buoyant force",
          "feedback": "Buoyancy and bottom contact partition the object’s weight; adding buoyancy again counts support twice."
        }
      ],
      "answer": "weight",
      "explanation": [
        "Consider the object, water, and beaker as one stationary system. Once the string is slack, the balance supports the added object’s full weight.",
        "Forces between the object, water, and bottom are internal to this combined system. They must not be counted again on top of the object’s weight."
      ]
    }
  },
  {
    "id": "reasoning-tether-cut",
    "title": "Before and after the cut",
    "concept": "Buoyancy",
    "diagram": "tether",
    "daily": true,
    "prompt": "A light rigid block is held fully underwater by a string tied to the tank bottom. Cut the string. Which account of buoyancy is consistent from the instant of cutting to the block’s final floating rest?",
    "conditions": [
      "The block’s average density is less than the water’s. It neither absorbs water nor changes volume.",
      "The water is of uniform density. Compare hydrostatic buoyancy, neglecting the string, surface tension, and transient fluid-inertia forces in the initial force comparison.",
      "The block eventually settles floating freely at the surface."
    ],
    "check": {
      "constant": "Mass, weight, and total block volume stay fixed.",
      "forces": "Before cutting, buoyancy balances weight plus downward string tension.",
      "equilibrium": "Distinguish the immediate force imbalance from the later floating equilibrium."
    },
    "options": [
      {
        "id": "same-then-less",
        "text": "Buoyancy is initially unchanged, then becomes smaller as the block emerges",
        "feedback": "The cut removes tension, not displaced volume. Once part emerges, less water is displaced."
      },
      {
        "id": "less-immediate",
        "text": "Buoyancy immediately falls to the block’s weight",
        "feedback": "The removed string does not instantly change the fully submerged volume or establish floating equilibrium."
      },
      {
        "id": "same-forever",
        "text": "Buoyancy stays unchanged all the way to floating rest",
        "feedback": "It stays the same while the rigid block is fully immersed, but falls as the block emerges."
      }
    ],
    "answer": "same-then-less",
    "hints": [
      "Immediately after the cut, has the block’s submerged volume changed?",
      "Remove the string force from the original balance. Is there now a net force?",
      "Only when the block emerges does its displaced-water volume decrease toward the value needed for floating rest."
    ],
    "explanation": [
      "While held, the fully submerged block has buoyancy greater than its weight; the string supplies the extra downward force.",
      "Immediately after cutting, the displaced volume is unchanged, so buoyancy is unchanged and the block accelerates upward.",
      "For the ideal rigid block in uniform water, hydrostatic buoyancy does not increase merely because it is deeper.",
      "As the block emerges, buoyancy decreases. At final floating rest it equals weight, which is smaller than the initial buoyancy."
    ],
    "changes": "A compressible object can change volume with depth. Strong flow or drag during motion adds forces beyond the initial hydrostatic comparison.",
    "sources": [
      {
        "title": "OpenStax University Physics, 14.4: Archimedes’ Principle and Buoyancy",
        "url": "https://openstax.org/books/university-physics-volume-1/pages/14-4-archimedes-principle-and-buoyancy"
      },
      {
        "title": "OpenStax University Physics, 6.1: Applying Newton’s Laws",
        "url": "https://openstax.org/books/university-physics-volume-1/pages/6-1-solving-problems-with-newtons-laws"
      }
    ],
    "variation": {
      "prompt": "Instead of cutting the string, slowly shorten it while the rigid block stays completely submerged. Does the required holding tension become greater merely because the block is deeper?",
      "conditions": [
        "The water remains uniform and the block’s volume stays fixed.",
        "Move slowly enough that drag and acceleration are negligible."
      ],
      "check": {
        "constant": "Weight and displaced-water volume remain fixed.",
        "forces": "Upward buoyancy balances weight plus downward tension.",
        "equilibrium": "The pressure at both top and bottom changes with depth; consider their difference."
      },
      "hints": [
        "The absolute pressures rise together with depth.",
        "The same displaced-water weight gives the same buoyancy."
      ],
      "options": [
        {
          "id": "same",
          "text": "No; the tension stays the same",
          "feedback": "Both weight and buoyancy are unchanged in this ideal comparison."
        },
        {
          "id": "greater",
          "text": "Yes; deeper water always gives more buoyancy",
          "feedback": "Depth raises pressure everywhere but not the net buoyant force for a fixed volume in uniform water."
        },
        {
          "id": "zero",
          "text": "The tension becomes zero",
          "feedback": "The block remains less dense than water and still needs a downward holding force."
        }
      ],
      "answer": "same",
      "explanation": [
        "Hydrostatic buoyancy equals the weight of displaced water, independent of depth here.",
        "The required downward tension is buoyancy minus weight, so it is unchanged."
      ]
    }
  },
  {
    "id": "reasoning-gas-count-energy",
    "title": "Hotter, but how much energy?",
    "concept": "Density",
    "diagram": "gas-open",
    "daily": true,
    "prompt": "Two equal-volume samples of the same monatomic ideal gas have equal pressure. One is hotter. Which comparison of particle number and total internal energy is consistent?",
    "conditions": [
      "Compare distinct gas samples, not the heating of one sealed sample.",
      "Pressures are absolute; temperatures are in kelvin.",
      "The gas has only translational internal kinetic energy in this model. Ignore gravity and electronic excitation."
    ],
    "check": {
      "constant": "Pressure, volume, and particle species are the same for both samples.",
      "forces": "Gas pressure comes from particle momentum transfer to the walls.",
      "equilibrium": "Both samples are internally equilibrated; their temperatures need not equal each other."
    },
    "options": [
      {
        "id": "fewer-same",
        "text": "The hotter sample has fewer particles, but the same total internal energy",
        "feedback": "Greater average energy per particle is offset by fewer particles at the same pressure and volume."
      },
      {
        "id": "same-more",
        "text": "It has the same number of particles and more total energy",
        "feedback": "Equal volume alone does not fix particle number. Equal pressure imposes an additional constraint."
      },
      {
        "id": "fewer-more",
        "text": "It has fewer particles and necessarily more total energy",
        "feedback": "Temperature fixes average energy per particle, not the sum when particle numbers differ."
      }
    ],
    "answer": "fewer-same",
    "hints": [
      "Equal pressure and volume fix the product of particle number and absolute temperature.",
      "The hotter sample has more kinetic energy per particle, but fewer particles.",
      "For this monatomic ideal-gas model, total internal energy is three-halves of pressure times volume."
    ],
    "explanation": [
      "The ideal gas law gives pressure × volume = particle number × Boltzmann constant × temperature.",
      "At the same pressure and volume, higher temperature therefore means fewer particles and lower mass density.",
      "Each particle has greater average kinetic energy, proportional to absolute temperature.",
      "The total is three-halves of particle number × Boltzmann constant × temperature, or three-halves of pressure × volume. It is the same for both samples."
    ],
    "changes": "If instead the samples have equal particle numbers and equal volumes, the hotter one has greater pressure and total energy. Additional internal degrees of freedom require the appropriate gas-energy model.",
    "sources": [
      {
        "title": "OpenStax University Physics, 2.1: Ideal Gas Constraints",
        "url": "https://openstax.org/books/university-physics-volume-2/pages/2-1-molecular-model-of-an-ideal-gas"
      },
      {
        "title": "OpenStax University Physics, 2.2: Pressure and Gas Energy",
        "url": "https://openstax.org/books/university-physics-volume-2/pages/2-2-pressure-temperature-and-rms-speed"
      }
    ],
    "variation": {
      "prompt": "Keep the equal volumes and the same monatomic ideal gas, but now specify equal particle numbers instead of equal pressures. One sample has twice the absolute temperature. What doubles?",
      "conditions": [
        "The samples contain the same number of identical atoms.",
        "Their rigid volumes are equal and translational energy is the only internal energy."
      ],
      "check": {
        "constant": "Particle number, mass density, and volume are fixed.",
        "forces": "More energetic particles transfer more momentum at the walls.",
        "equilibrium": "Compare the separately equilibrated samples."
      },
      "hints": [
        "Use pressure × volume = particle number × Boltzmann constant × temperature.",
        "Total translational energy is also proportional to particle number × temperature."
      ],
      "options": [
        {
          "id": "pressure-energy",
          "text": "Pressure and total internal energy both double",
          "feedback": "Both depend on absolute temperature at fixed particle number and volume."
        },
        {
          "id": "density-energy",
          "text": "Density and total internal energy both double",
          "feedback": "Density is mass divided by volume; neither has changed."
        },
        {
          "id": "energy-only",
          "text": "Only total internal energy doubles; pressure is unchanged",
          "feedback": "Pressure cannot stay fixed when the same particles have twice the temperature in the same volume."
        }
      ],
      "answer": "pressure-energy",
      "explanation": [
        "Fixed particle number and volume make pressure proportional to absolute temperature.",
        "Total monatomic ideal-gas internal energy is also proportional to absolute temperature at fixed particle number. Both double."
      ]
    }
  },
  {
    "id": "reasoning-heating-two-constraints",
    "title": "Two ways to warm the gas",
    "concept": "Pressure",
    "diagram": null,
    "daily": true,
    "prompt": "Two identical gas samples begin at the same pressure, volume, and temperature. Warm each to twice its absolute temperature. A stays sealed and rigid; B expands under a piston at constant pressure. Which final comparison is consistent?",
    "conditions": [
      "Each sample keeps the same fixed mass of the same ideal gas; neither leaks.",
      "A has fixed volume. B has a frictionless piston with maintained external pressure and no stop limiting expansion.",
      "Compare final equilibrated states; all pressures are absolute and temperatures are in kelvin."
    ],
    "check": {
      "constant": "Mass stays fixed in both, but volume stays fixed only in A.",
      "forces": "A’s walls restrain expansion; B’s gas balances the maintained piston load.",
      "equilibrium": "The final pressure in B equals its maintained external pressure."
    },
    "options": [
      {
        "id": "different",
        "text": "A: pressure doubles, density stays fixed. B: pressure stays fixed, density halves.",
        "feedback": "The same temperature change has different consequences because the mechanical constraints differ."
      },
      {
        "id": "both-density",
        "text": "Both samples halve their density",
        "feedback": "A cannot halve its density without losing mass or expanding, and both are forbidden."
      },
      {
        "id": "both-pressure",
        "text": "Both samples double their pressure",
        "feedback": "B expands until its pressure balances the unchanged external pressure."
      }
    ],
    "answer": "different",
    "hints": [
      "Use density = mass / volume before reasoning from hotter air in everyday life.",
      "For a fixed gas mass, pressure × volume / absolute temperature is constant.",
      "A changes pressure; B changes volume. Identify which wall can move."
    ],
    "explanation": [
      "For A, fixed mass and volume keep density unchanged. Doubling absolute temperature doubles pressure.",
      "For B, the maintained pressure lets the piston move. Doubling absolute temperature doubles volume.",
      "The unchanged mass now occupies twice the volume in B, so its density halves.",
      "A statement such as “heating makes gas less dense” needs the pressure or volume constraint attached to it."
    ],
    "changes": "A leaking container, a piston that hits a stop, changing external pressure, or nonideal gas behavior would need a different analysis.",
    "sources": [
      {
        "title": "OpenStax University Physics, 2.1: Ideal Gas Constraints",
        "url": "https://openstax.org/books/university-physics-volume-2/pages/2-1-molecular-model-of-an-ideal-gas"
      }
    ],
    "variation": {
      "prompt": "B expands while heating, then its piston hits a rigid stop. The gas is heated further without leaking. After the stop is reached, what happens to density and pressure?",
      "conditions": [
        "Consider only the additional heating after the piston is against the stop.",
        "The gas remains ideal, mass stays fixed, and the final volume cannot change."
      ],
      "check": {
        "constant": "After the stop, mass and volume both stay fixed.",
        "forces": "The stop now prevents further piston motion.",
        "equilibrium": "The stop can support a pressure difference; gas pressure no longer has to equal the original load pressure."
      },
      "hints": [
        "Which original constraint has changed?",
        "The stopped piston behaves as a rigid wall."
      ],
      "options": [
        {
          "id": "fixed-rises",
          "text": "Density stays fixed and pressure rises",
          "feedback": "The gas is now in the rigid fixed-volume regime."
        },
        {
          "id": "falls-fixed",
          "text": "Density keeps falling while pressure stays fixed",
          "feedback": "That requires continued expansion, which the stop prevents."
        },
        {
          "id": "both-rise",
          "text": "Both density and pressure rise",
          "feedback": "Heating adds energy, not mass; fixed mass and volume keep density unchanged."
        }
      ],
      "answer": "fixed-rises",
      "explanation": [
        "Once the piston stops, no additional volume is available.",
        "With mass and volume fixed, density stays constant while pressure rises with absolute temperature."
      ]
    }
  },
  {
    "id": "reasoning-balloon-equilibrium",
    "title": "Equal pressure, unequal balloons",
    "concept": "Pressure",
    "diagram": "balloons",
    "daily": true,
    "prompt": "Two different-size real rubber balloons are connected by a valve. Immediately before opening, their measured internal pressures are equal. What can you conclude about initial flow and their response to a small disturbance?",
    "conditions": [
      "Both contain the same air at the same temperature and elevation.",
      "The connecting tube has negligible volume; ignore leaks, pumps, and valve-opening transients.",
      "The membrane pressure–volume relations and inflation histories are not supplied."
    ],
    "check": {
      "constant": "The measured initial pressure difference is zero.",
      "forces": "Pressure differences drive flow; membrane elasticity helps set each balloon’s pressure.",
      "equilibrium": "Pressure equality is an equilibrium condition, but stability concerns the response to a disturbance."
    },
    "options": [
      {
        "id": "no-flow-unknown",
        "text": "No initial pressure-driven flow; stability cannot be determined from these facts",
        "feedback": "Equal pressure removes the initial driving difference, while stability needs the membranes’ responses to changing volume."
      },
      {
        "id": "equal-volumes",
        "text": "They must exchange air until their volumes become equal",
        "feedback": "Equal pressure is not generally equivalent to equal volume for elastic containers."
      },
      {
        "id": "small-to-large",
        "text": "The smaller balloon must immediately feed the larger one",
        "feedback": "The measured pressures are equal, and real rubber does not obey a universal size-only flow rule."
      }
    ],
    "answer": "no-flow-unknown",
    "hints": [
      "Separate “no driving pressure difference now” from “returns after a disturbance.”",
      "A disturbance changes volume. How each pressure responds depends on its elastic relation.",
      "Two unequal volumes can have equal pressure. You need more than that equality to decide stability."
    ],
    "explanation": [
      "With equal pressure at the same elevation, there is no initial macroscopic pressure-driven flow in this ideal comparison.",
      "Equal pressure does not require equal volume. Rubber’s pressure response changes with stretching and inflation state.",
      "A small transfer could create a restoring pressure difference or one that drives further transfer, depending on those responses.",
      "Without the membrane relations and history, neither stability nor final volumes after a disturbance can be inferred."
    ],
    "changes": "Unequal measured pressures determine an initial flow direction, but final sizes still require elastic and gas-state information. Real rubber can show either size-to-size flow direction in different inflation regimes.",
    "sources": [
      {
        "title": "Levin and da Silveira: To grow or to shrink — two rubber balloons",
        "url": "https://arxiv.org/abs/cond-mat/0403171"
      },
      {
        "title": "OpenStax University Physics, 2.1: Ideal Gas Constraints",
        "url": "https://openstax.org/books/university-physics-volume-2/pages/2-1-molecular-model-of-an-ideal-gas"
      }
    ],
    "variation": {
      "prompt": "Change only one measurement: immediately before opening, the smaller balloon is at 104 kPa and the larger at 102 kPa. What can now be concluded?",
      "conditions": [
        "Keep the same temperature, elevation, negligible-tube, and no-leak assumptions.",
        "The membrane pressure–volume relations remain unknown."
      ],
      "check": {
        "constant": "The initial pressures are now unequal.",
        "forces": "The initial pressure difference drives gas from higher pressure toward lower pressure.",
        "equilibrium": "Initial direction and final connected state are separate questions."
      },
      "hints": [
        "Which balloon has the greater measured pressure?",
        "One pressure snapshot does not specify how pressure changes during transfer."
      ],
      "options": [
        {
          "id": "direction-only",
          "text": "Air initially goes smaller → larger; final volumes are still undetermined",
          "feedback": "The measurements settle the initial direction but not the later elastic evolution."
        },
        {
          "id": "equal-final",
          "text": "Air goes smaller → larger until the volumes are equal",
          "feedback": "Flow tends to remove pressure differences, not necessarily volume differences."
        },
        {
          "id": "history-first",
          "text": "Even the initial direction remains unknown until the elastic law is supplied",
          "feedback": "The elastic law is needed for later evolution; the supplied initial pressure difference already gives the initial direction."
        }
      ],
      "answer": "direction-only",
      "explanation": [
        "The smaller balloon initially has higher pressure, so gas initially flows toward the larger.",
        "As volumes change, the unknown elastic responses matter. The initial measurements do not determine final sizes."
      ]
    }
  },
  {
    "id": "reasoning-steady-drag-load",
    "title": "Steady flight still needs a tilt",
    "concept": "Forces",
    "diagram": "flight",
    "daily": true,
    "prompt": "A helicopter and its suspended load fly steadily to the right at constant height. Air drag pulls the load horizontally left. Which statement about the rope and its tension is consistent?",
    "conditions": [
      "The load has zero acceleration and a nonzero horizontal drag force.",
      "The rope is taut and flexible; neglect its mass and drag.",
      "Neglect load buoyancy and rotor downwash. The only forces on the load are weight, drag, and rope tension."
    ],
    "check": {
      "constant": "The load’s horizontal and vertical velocities are constant.",
      "forces": "Tension must balance both weight and the backward drag.",
      "equilibrium": "The vector sum of forces on the load is zero; that need not make each force zero."
    },
    "options": [
      {
        "id": "tilted-stronger",
        "text": "The rope is straight and trails backward; tension is greater than the load’s weight",
        "feedback": "Its upward component balances weight and its forward component balances drag, so its total exceeds the upward component."
      },
      {
        "id": "vertical-equal",
        "text": "The rope is vertical and tension equals weight",
        "feedback": "That balances gravity but leaves drag unbalanced, so steady motion would be impossible."
      },
      {
        "id": "curved-equal",
        "text": "The rope curves backward and tension equals weight",
        "feedback": "Payload drag tilts the tension. An ideal massless, dragless rope has no distributed force to make it curve."
      }
    ],
    "answer": "tilted-stronger",
    "hints": [
      "Zero acceleration requires the horizontal drag to be balanced too.",
      "Tension points along the rope. It needs a forward component as well as an upward component.",
      "A tilted force with upward component equal to weight has a magnitude greater than weight."
    ],
    "explanation": [
      "The load’s vertical balance requires the upward tension component to equal its weight.",
      "Horizontal balance requires a forward tension component equal to the backward payload drag.",
      "The rope is therefore tilted, with the load behind the helicopter, and the total tension is greater than weight.",
      "Neglected rope mass and rope drag mean no distributed force bends the taut rope; it is straight in this idealization."
    ],
    "changes": "With no payload drag and steady motion the rope is vertical. Rope weight or distributed rope drag can produce curvature; acceleration changes the force balance.",
    "sources": [
      {
        "title": "OpenStax University Physics, 6.1: Applying Newton’s Laws",
        "url": "https://openstax.org/books/university-physics-volume-1/pages/6-1-solving-problems-with-newtons-laws"
      },
      {
        "title": "OpenStax University Physics, 5.6: Tension and Common Forces",
        "url": "https://openstax.org/books/university-physics-volume-1/pages/5-6-common-forces"
      }
    ],
    "variation": {
      "prompt": "The helicopter now hovers in still air and the payload’s horizontal drag is zero. Keep the same rope idealizations. What changes?",
      "conditions": [
        "Helicopter and load are stationary.",
        "Continue to neglect rope mass/drag, buoyancy, and downwash."
      ],
      "check": {
        "constant": "The payload weight is unchanged.",
        "forces": "Only weight and tension act on the load.",
        "equilibrium": "Both force components balance with no horizontal force to oppose."
      },
      "hints": [
        "Which horizontal tension component is still needed?",
        "With only two balancing forces, their directions must oppose directly."
      ],
      "options": [
        {
          "id": "vertical-weight",
          "text": "The rope becomes vertical and tension equals weight",
          "feedback": "No horizontal force requires a tilt."
        },
        {
          "id": "tilted-weight",
          "text": "It stays tilted but tension becomes equal to weight",
          "feedback": "A tilted tension cannot balance a purely vertical weight without another horizontal force."
        },
        {
          "id": "vertical-more",
          "text": "It becomes vertical but tension stays greater than weight",
          "feedback": "That would give the stationary load an unbalanced upward force."
        }
      ],
      "answer": "vertical-weight",
      "explanation": [
        "With no horizontal force, the tension is vertical.",
        "Its magnitude equals weight to maintain zero vertical acceleration."
      ]
    }
  },
  {
    "id": "reasoning-accelerating-load",
    "title": "Motion and acceleration disagree",
    "concept": "Forces",
    "diagram": null,
    "daily": true,
    "prompt": "A helicopter and its load are moving upward, but slowing down. Their vertical separation stays constant. With no sideways motion, how does the rope tension compare with the load’s weight?",
    "conditions": [
      "At this instant their common acceleration is downward, with magnitude less than gravitational acceleration.",
      "The rope stays taut. Neglect rope mass and drag, payload air forces, buoyancy, and rotor downwash.",
      "Only vertical tension and gravity act on the load; compare this instant, not a later stop."
    ],
    "check": {
      "constant": "The load’s mass is fixed; upward velocity is not constant.",
      "forces": "Weight acts downward and rope tension upward.",
      "equilibrium": "This is not equilibrium: net force points with acceleration, not necessarily with velocity."
    },
    "options": [
      {
        "id": "less",
        "text": "Tension is less than weight, even though the load is moving upward",
        "feedback": "A downward net force slows an upward-moving load."
      },
      {
        "id": "more",
        "text": "Tension is greater than weight because it is moving upward",
        "feedback": "That would produce upward acceleration, increasing the upward speed instead of reducing it."
      },
      {
        "id": "equal",
        "text": "Tension equals weight because the rope stays straight",
        "feedback": "Straightness gives a force direction; zero net force would require constant velocity, which is not stated."
      }
    ],
    "answer": "less",
    "hints": [
      "Draw an upward velocity arrow and a separate acceleration arrow. Which way does each point?",
      "Slowing while moving up means downward acceleration.",
      "The downward weight must exceed upward tension to give a downward net force."
    ],
    "explanation": [
      "The load is moving upward, but its decreasing speed means its acceleration is downward.",
      "Newton’s second law relates net force to acceleration, rather than to the direction of motion.",
      "With only vertical forces, weight minus tension equals mass times the downward acceleration. Tension is therefore less than weight.",
      "The acceleration is smaller than gravity, leaving positive tension and a taut vertical rope."
    ],
    "changes": "At constant upward speed, tension equals weight. Upward acceleration needs greater tension. Downward acceleration equal to gravity would allow zero tension and need not keep the rope taut.",
    "sources": [
      {
        "title": "OpenStax University Physics, 6.1: Applying Newton’s Laws",
        "url": "https://openstax.org/books/university-physics-volume-1/pages/6-1-solving-problems-with-newtons-laws"
      }
    ],
    "variation": {
      "prompt": "Change the motion: at constant height the load accelerates right with the helicopter, while air forces are negligible. What rope and tension are needed?",
      "conditions": [
        "There is nonzero rightward acceleration and zero vertical acceleration.",
        "The rope remains taut, flexible, massless, and dragless; neglect buoyancy and downwash."
      ],
      "check": {
        "constant": "Weight and height stay fixed, but horizontal velocity changes.",
        "forces": "Tension supplies upward support and rightward acceleration.",
        "equilibrium": "Vertical forces balance; horizontal forces do not."
      },
      "hints": [
        "The vertical tension component still balances weight.",
        "A separate rightward component must produce the horizontal acceleration."
      ],
      "options": [
        {
          "id": "tilted-more",
          "text": "A straight rope with the load behind; tension greater than weight",
          "feedback": "The tilt supplies a horizontal component in addition to the upward support."
        },
        {
          "id": "vertical-more",
          "text": "A vertical rope with tension greater than weight",
          "feedback": "A vertical force cannot accelerate the load horizontally and would upset vertical balance."
        },
        {
          "id": "curved-weight",
          "text": "A curved rope with tension equal to weight",
          "feedback": "No distributed force bends the ideal rope, and tension needs both vertical and horizontal components."
        }
      ],
      "answer": "tilted-more",
      "explanation": [
        "The tension’s upward component equals weight and its rightward component equals mass times acceleration.",
        "The rope tilts with the load behind the helicopter. Its total tension exceeds weight and the ideal rope remains straight."
      ]
    }
  },
  {
    "id": "reasoning-hydraulic-trade",
    "title": "The lift’s missing bargain",
    "concept": "Pressure",
    "diagram": "hydraulic",
    "daily": true,
    "prompt": "A hydraulic lift has an output piston four times the input piston’s area. A steady push on the small piston lifts a load slowly. Which force, movement, and work comparison can all be true together?",
    "conditions": [
      "Use an incompressible fluid, frictionless massless pistons, and no leaks.",
      "Both piston exteriors are at the same atmospheric pressure; neglect hydrostatic head between pistons.",
      "Motion is slow and the load is balanced. Compare input and output work, excluding fluid heating and stored kinetic energy."
    ],
    "check": {
      "constant": "The fluid volume displaced from one side equals the volume gained on the other.",
      "forces": "The applied excess pressure acts over different piston areas.",
      "equilibrium": "Each piston is in approximate force balance while moving slowly."
    },
    "options": [
      {
        "id": "trade",
        "text": "Output force is 4×, output travel is ¼, and ideal work is unchanged",
        "feedback": "Greater area turns the same excess pressure into greater force, while volume conservation trades away travel."
      },
      {
        "id": "free-work",
        "text": "Output force and travel are both 4×, giving more work",
        "feedback": "That would violate the fluid-volume constraint and energy conservation."
      },
      {
        "id": "same-travel",
        "text": "Output force is 4× with equal travel and equal work",
        "feedback": "Equal travel at unequal areas displaces unequal fluid volumes; force times travel also would not match."
      }
    ],
    "answer": "trade",
    "hints": [
      "Separate pressure, force, and work. Equal excess pressure does not imply equal force.",
      "Fluid volume is piston area times travel.",
      "Four times the force acting through a quarter of the travel gives the same force × distance."
    ],
    "explanation": [
      "The applied pressure increase is transmitted through the fluid. Four times the piston area gives four times the output force.",
      "If the small piston moves down a distance, it expels area × distance of fluid.",
      "The larger piston takes that same volume, so it rises only a quarter of the input distance.",
      "The output force multiplied by output distance equals the input work in this ideal slow motion. A force advantage is not an energy gain."
    ],
    "changes": "Friction, leaks, piston weight, fluid compression, height differences, and acceleration introduce additional force or energy terms.",
    "sources": [
      {
        "title": "OpenStax University Physics, 14.3: Pascal’s Principle and Hydraulics",
        "url": "https://openstax.org/books/university-physics-volume-1/pages/14-3-pascals-principle-and-hydraulics"
      },
      {
        "title": "OpenStax University Physics, 8.3: Conservation of Energy",
        "url": "https://openstax.org/books/university-physics-volume-1/pages/8-3-conservation-of-energy"
      }
    ],
    "variation": {
      "prompt": "Use the same lift backward: push the large piston down slowly so the small piston rises. What happens to the output force and travel now?",
      "conditions": [
        "The area ratio remains four to one.",
        "Keep the same lossless, negligible-head, slow-motion assumptions."
      ],
      "check": {
        "constant": "The displaced fluid volumes must still match.",
        "forces": "The same excess pressure acts on the smaller output area.",
        "equilibrium": "Each piston remains approximately balanced."
      },
      "hints": [
        "Now the output area is one quarter of the input area.",
        "Conservation of fluid volume still links the distances."
      ],
      "options": [
        {
          "id": "force-quarter",
          "text": "Output force is ¼ and output travel is 4×",
          "feedback": "The force advantage reverses into a travel advantage."
        },
        {
          "id": "both-four",
          "text": "Output force and travel are both 4×",
          "feedback": "Reversing a lossless machine cannot create extra energy."
        },
        {
          "id": "both-quarter",
          "text": "Output force and travel are both ¼",
          "feedback": "The smaller piston must move farther to receive the same volume."
        }
      ],
      "answer": "force-quarter",
      "explanation": [
        "The small output piston receives one quarter of the input force at equal excess pressure.",
        "It travels four times as far. Ideal input and output work still match."
      ]
    }
  },
  {
    "id": "reasoning-wet-balance",
    "title": "A balance loses its balance",
    "concept": "Equilibrium",
    "diagram": null,
    "daily": true,
    "prompt": "Two identical steel blocks hang at equal distances from a beam’s pivot. They initially balance. Keep the beam horizontal while immersing only the left block in water. Which side now has the greater downward turning effect, requiring an extra holding torque?",
    "conditions": [
      "The beam’s own weight is negligible, its pivot frictionless, and the strings massless and vertical. An external restraint keeps the beam horizontal and stationary.",
      "The left block is fully submerged, motionless initially, and touches neither walls nor bottom.",
      "The water vessel is supported independently of the beam. No water overflows. Neglect air buoyancy and surface tension."
    ],
    "check": {
      "constant": "The blocks’ masses and the initial lever arms have not changed.",
      "forces": "The left block is supported by both water and its string; the right block by its string alone.",
      "equilibrium": "Compare torques on the held-stationary beam, using forces actually transmitted to it."
    },
    "options": [
      {
        "id": "right",
        "text": "The right side has the greater downward turning effect",
        "feedback": "Buoyancy reduces the left string tension, so the right side applies greater torque to the beam."
      },
      {
        "id": "balance",
        "text": "It stays balanced because the masses are still equal",
        "feedback": "Mass equality is not enough when an independent support carries part of one block’s weight."
      },
      {
        "id": "left",
        "text": "The left side has the greater downward turning effect because water adds pressure",
        "feedback": "Pressure produces an upward buoyant force on the block; it reduces rather than increases the string’s load."
      }
    ],
    "answer": "right",
    "hints": [
      "Consider the left block before considering the beam. What supports its weight?",
      "Its string tension is weight minus buoyancy.",
      "The beam responds to string tensions multiplied by lever arms, not to the blocks’ masses alone."
    ],
    "explanation": [
      "The submerged left block has an upward buoyant force in addition to string tension.",
      "While everything is held stationary, its string therefore transmits weight minus buoyancy to the beam.",
      "The right string still transmits full weight. With equal lever arms, its downward turning effect is greater.",
      "An additional holding torque is needed to oppose the right side’s greater turning effect. Some load support has been transferred to the independently supported water vessel."
    ],
    "changes": "If the water vessel sits on the same beam, its reaction force must also be included. Different lever arms, partial immersion, or contact could change the torque comparison.",
    "sources": [
      {
        "title": "OpenStax University Physics, 14.4: Archimedes’ Principle and Buoyancy",
        "url": "https://openstax.org/books/university-physics-volume-1/pages/14-4-archimedes-principle-and-buoyancy"
      },
      {
        "title": "OpenStax University Physics, 12.1: Static Equilibrium and Torque",
        "url": "https://openstax.org/books/university-physics-volume-1/pages/12-1-conditions-for-static-equilibrium"
      }
    ],
    "variation": {
      "prompt": "Instead immerse both identical blocks fully in separate vessels of the same water, each supported independently. Keep the beam stationary with equal lever arms. Is an extra holding torque needed?",
      "conditions": [
        "The equal-volume steel blocks touch no vessel surfaces.",
        "Both blocks and the beam remain stationary; the blocks are fully immersed in the same-density water."
      ],
      "check": {
        "constant": "Both weights, submerged volumes, and lever arms match.",
        "forces": "Both strings transmit weight minus an equal buoyant force.",
        "equilibrium": "Compare the equal and opposite initial torques."
      },
      "hints": [
        "Do the two blocks displace equal volumes of water?",
        "Equal reductions in tension leave equal turning effects."
      ],
      "options": [
        {
          "id": "balanced",
          "text": "No; the two downward turning effects balance",
          "feedback": "The buoyant reductions are equal on both sides."
        },
        {
          "id": "left",
          "text": "Yes; the left side has the greater turning effect because it was immersed first",
          "feedback": "The initial force balance depends on the stated present conditions, not that ordering."
        },
        {
          "id": "both",
          "text": "Yes; reducing both string tensions requires an extra holding torque",
          "feedback": "Both loads are reduced equally, so their opposite torques still balance. A smaller total load at the pivot is not a turning imbalance."
        }
      ],
      "answer": "balanced",
      "explanation": [
        "Identical fully submerged blocks have equal buoyant forces.",
        "Equal apparent weights act at equal arms, so the initial torques balance."
      ]
    }
  },
  {
    "id": "reasoning-mass-and-tracks",
    "title": "Same speed, different energy",
    "concept": "Energy",
    "diagram": "ramp",
    "daily": true,
    "prompt": "Two small beads, one with twice the other’s mass, slide from rest down different smooth tracks through the same vertical drop. Which comparison of endpoint speed and kinetic energy is consistent?",
    "conditions": [
      "Tracks are fixed and frictionless. Ignore air resistance and bead rotation.",
      "Both beads remain on their tracks and reach the compared endpoints.",
      "The vertical drops are equal; track lengths and shapes may differ. Ask about endpoint states, not arrival times."
    ],
    "check": {
      "constant": "The vertical drop is the same, but mass is not.",
      "forces": "Gravity does work; the stationary track’s normal force changes direction of motion without doing work.",
      "equilibrium": "This is an energy comparison, not a claim of force equilibrium."
    },
    "options": [
      {
        "id": "same-double",
        "text": "Speeds are equal; the heavier bead has twice the kinetic energy",
        "feedback": "The mass factor cancels in the speed relation, but not in total kinetic energy."
      },
      {
        "id": "faster-double",
        "text": "The heavier bead is faster and has twice the kinetic energy",
        "feedback": "Greater gravitational energy also comes with proportionally greater inertia; it does not give a greater speed for the same drop."
      },
      {
        "id": "same-same",
        "text": "Speeds and kinetic energies are both equal",
        "feedback": "Equal speed does not imply equal kinetic energy when the masses differ."
      }
    ],
    "answer": "same-double",
    "hints": [
      "The lost gravitational energy is mass × gravity × vertical drop.",
      "Set that equal to one-half × mass × speed squared.",
      "Mass cancels when finding speed, but remains when comparing total energies."
    ],
    "explanation": [
      "Each bead’s gravitational potential energy loss becomes translational kinetic energy.",
      "Equating mass × gravity × drop to one-half × mass × speed squared gives the same endpoint speed for the same drop.",
      "The heavier bead loses twice as much potential energy and therefore gains twice as much kinetic energy.",
      "Track shape can change the travel time without changing these endpoint conclusions under the stated conditions."
    ],
    "changes": "Friction, air resistance, rotation, a moving track, or unequal drops can change the result. Equal travel time is not established by this energy argument.",
    "sources": [
      {
        "title": "OpenStax University Physics, 8.3: Conservation of Energy",
        "url": "https://openstax.org/books/university-physics-volume-1/pages/8-3-conservation-of-energy"
      }
    ],
    "variation": {
      "prompt": "Now give the two beads the same kinetic energy on a horizontal frictionless track. One still has twice the mass. Must they have the same speed?",
      "conditions": [
        "Only translational kinetic energy is considered.",
        "Compare speeds at the instant both have equal kinetic energy."
      ],
      "check": {
        "constant": "Energy is equal, rather than vertical drop or speed.",
        "forces": "No horizontal force is needed for the subsequent constant-speed motion.",
        "equilibrium": "Use the energy relation with the different masses."
      },
      "hints": [
        "Kinetic energy contains both mass and speed squared.",
        "With more mass, a smaller speed can give the same energy."
      ],
      "options": [
        {
          "id": "heavy-slower",
          "text": "No; the heavier bead is slower",
          "feedback": "For equal kinetic energy, speed decreases as the inverse square root of mass."
        },
        {
          "id": "same",
          "text": "Yes; equal kinetic energy always means equal speed",
          "feedback": "That inference would require equal masses as well."
        },
        {
          "id": "heavy-faster",
          "text": "No; the heavier bead is faster",
          "feedback": "A greater mass needs a smaller speed, not a larger one, to keep kinetic energy fixed."
        }
      ],
      "answer": "heavy-slower",
      "explanation": [
        "From kinetic energy = one-half × mass × speed squared, equal energy requires mass × speed squared to match.",
        "The bead with twice the mass has speed equal to the lighter bead’s speed divided by the square root of two."
      ]
    }
  },
  {
    "id": "reasoning-hydrostatic-paradox",
    "title": "More water, same bottom force?",
    "concept": "Pressure",
    "diagram": "vessel-shapes",
    "daily": true,
    "prompt": "Two open vessels have equal horizontal base areas and water surfaces at the same height above their bases. One widens upward and holds more water. How do water pressure and the downward water force on the bases compare?",
    "conditions": [
      "Both contain stationary water of the same uniform density and meet the same atmospheric pressure.",
      "The bases are at the same elevation; compare pressure and water force over their equal base areas.",
      "Ignore surface tension. Sidewalls are rigid; do not assume their forces on water are horizontal."
    ],
    "check": {
      "constant": "Surface pressure, water depth, fluid density, and base area are the same.",
      "forces": "Base, sidewalls, atmosphere, and gravity all exert forces on the water.",
      "equilibrium": "A larger total water weight need not all be supported by the base."
    },
    "options": [
      {
        "id": "both-same",
        "text": "Both bottom pressures and bottom forces are equal",
        "feedback": "Depth fixes bottom pressure; equal area then gives equal bottom force. Sidewalls account for the different water weights."
      },
      {
        "id": "both-more",
        "text": "The wider vessel has greater bottom pressure and force because it holds more weight",
        "feedback": "That assumes the base alone supports all the water; inclined walls can carry a vertical force."
      },
      {
        "id": "pressure-same-force-more",
        "text": "Pressure is equal, but the wider vessel has greater bottom force",
        "feedback": "At equal uniform pressure and equal base area, the pressure force on the base must also be equal."
      }
    ],
    "answer": "both-same",
    "hints": [
      "Hydrostatic pressure at a given depth depends on depth and fluid density, not total volume.",
      "Pressure force on a horizontal base is pressure times area.",
      "If the water weights differ, include vertical components of the sidewalls’ forces in the full force balance."
    ],
    "explanation": [
      "Both surfaces have the same atmospheric pressure, and both bases are the same depth below those surfaces.",
      "Hydrostatic bottom pressure is therefore equal in the vessels.",
      "Equal bottom pressure acting over equal base area gives equal downward water force on the bases.",
      "The vessel that widens upward can have sidewalls exerting an upward force on its water. This helps support its extra water weight; it does not demand greater bottom pressure."
    ],
    "changes": "A different water depth, surface pressure, fluid density, or base area changes the comparison. A balance under the whole vessel also supports the vessel walls, so it is not measuring base pressure alone.",
    "sources": [
      {
        "title": "OpenStax University Physics, 14.1: Density and Pressure",
        "url": "https://openstax.org/books/university-physics-volume-1/pages/14-1-fluids-density-and-pressure"
      }
    ],
    "variation": {
      "prompt": "Keep the same water depth and open-surface pressure, but double one vessel’s base area. What happens to its bottom pressure and the total water force on that base?",
      "conditions": [
        "The water is stationary and its density is unchanged.",
        "The new base is horizontal and all of it lies at the same depth."
      ],
      "check": {
        "constant": "Water depth and surface pressure stay fixed.",
        "forces": "Pressure acts over a different area.",
        "equilibrium": "Distinguish force per area from total force."
      },
      "hints": [
        "Depth still determines the pressure.",
        "The same pressure acts over twice the area."
      ],
      "options": [
        {
          "id": "same-double",
          "text": "Pressure stays the same; total base force doubles",
          "feedback": "Equal pressure over twice the area produces twice the force."
        },
        {
          "id": "both-double",
          "text": "Pressure and base force both double",
          "feedback": "Changing base area does not change the specified water depth or surface pressure."
        },
        {
          "id": "half-same",
          "text": "Pressure halves; base force stays the same",
          "feedback": "That would treat a fixed total force as given, but this fluid setup fixes pressure through depth instead."
        }
      ],
      "answer": "same-double",
      "explanation": [
        "Bottom pressure is unchanged because depth, density, and surface pressure are unchanged.",
        "The pressure force equals pressure times area, so doubling area doubles that force."
      ]
    }
  },
  {
    "id": "reasoning-friction-capacity",
    "title": "More grip, same friction?",
    "concept": "Forces",
    "diagram": "friction",
    "daily": true,
    "prompt": "A crate stays at rest while a rope pulls horizontally. Place an extra weight on top without changing the rope’s pull. The crate still rests. What happens to the actual floor friction and its maximum available value?",
    "conditions": [
      "The floor is horizontal, the rope horizontal, and there are no other horizontal forces.",
      "Use the usual static-friction model with unchanged coefficient of static friction.",
      "The added weight does not touch the floor separately. Both before and after, the pull is below the sliding threshold."
    ],
    "check": {
      "constant": "The applied horizontal pull is unchanged, but total vertical load increases.",
      "forces": "Floor friction balances the pull; the normal force supports the greater weight.",
      "equilibrium": "Rest requires a particular actual friction, while the friction limit is only a capacity."
    },
    "options": [
      {
        "id": "same-higher",
        "text": "Actual friction is unchanged; its maximum available value increases",
        "feedback": "The same pull needs the same balancing friction, although the larger normal force raises the threshold."
      },
      {
        "id": "both-higher",
        "text": "Actual friction and its maximum both increase",
        "feedback": "Only the limit necessarily rises. Larger actual friction would leave an unbalanced horizontal force here."
      },
      {
        "id": "both-same",
        "text": "Both remain unchanged",
        "feedback": "The actual friction is fixed by the pull, but the maximum depends on normal force."
      }
    ],
    "answer": "same-higher",
    "hints": [
      "First find the friction needed for horizontal balance with the unchanged pull.",
      "Then consider the normal force after the extra weight is added.",
      "Static friction is at most coefficient × normal force; it does not always equal that maximum."
    ],
    "explanation": [
      "Because the crate stays at rest, actual horizontal friction equals the unchanged rope pull in magnitude.",
      "The added weight increases the upward normal force required from the floor.",
      "In the stated model, the maximum possible static friction equals the coefficient times normal force, so that maximum increases.",
      "Greater grip changes how much friction is available before sliding. It does not force the actual friction to take that maximum value."
    ],
    "changes": "If the rope has a vertical component, the coefficient changes, or the crate starts sliding, the force balance and friction model require reconsideration.",
    "sources": [
      {
        "title": "OpenStax University Physics, 6.2: Static and Kinetic Friction",
        "url": "https://openstax.org/books/university-physics-volume-1/pages/6-2-friction"
      },
      {
        "title": "OpenStax University Physics, 6.1: Applying Newton’s Laws",
        "url": "https://openstax.org/books/university-physics-volume-1/pages/6-1-solving-problems-with-newtons-laws"
      }
    ],
    "variation": {
      "prompt": "After adding the weight, gradually increase the horizontal pull but keep it below the new sliding threshold. How does actual static friction respond?",
      "conditions": [
        "The crate remains at rest and the coefficient and normal force now stay fixed.",
        "There are still no other horizontal forces."
      ],
      "check": {
        "constant": "The maximum available static friction is now fixed.",
        "forces": "Pull and actual static friction remain opposite horizontal forces.",
        "equilibrium": "While rest continues, they must balance at each stage."
      },
      "hints": [
        "The limit is not necessarily the present force.",
        "Each larger pull requires a matching larger friction until the limit is reached."
      ],
      "options": [
        {
          "id": "follows",
          "text": "It increases to match the pull, up to the limit",
          "feedback": "This preserves horizontal balance while the crate remains at rest."
        },
        {
          "id": "maximum",
          "text": "It immediately takes its maximum value even for a smaller pull",
          "feedback": "That would give an unbalanced horizontal force when the pull is below the maximum."
        },
        {
          "id": "unchanged",
          "text": "It stays at its previous value until the instant of slipping",
          "feedback": "Then an increased pull would already be unbalanced, contradicting continued rest."
        }
      ],
      "answer": "follows",
      "explanation": [
        "Static friction adjusts to balance the applied pull while the crate is at rest.",
        "Only at the threshold does actual friction reach the maximum; beyond it the crate can slide."
      ]
    }
  },
  {
    "id": "reasoning-compress-and-release",
    "title": "Same mass, different fate",
    "concept": "Density",
    "diagram": null,
    "daily": true,
    "prompt": "A sealed body has an average density three-quarters that of water. An external press compresses it to half its original volume, without losing mass, and its new shape is held rigid. Released fully underwater, does it rise or sink?",
    "conditions": [
      "The press is removed before release; the body’s locked shape keeps the smaller volume.",
      "The surrounding water has uniform density. Neglect attached hardware mass changes, trapped external air, surface tension, and initial water motion.",
      "At release the body is motionless, completely submerged, and not touching any solid surface."
    ],
    "check": {
      "constant": "The body’s mass and weight are unchanged, but its exterior volume is halved.",
      "forces": "Gravity opposes buoyancy from the displaced water.",
      "equilibrium": "Compare forces at release; neither floating nor neutral equilibrium is assumed."
    },
    "options": [
      {
        "id": "sinks",
        "text": "It sinks: density becomes greater than water and buoyancy is too small",
        "feedback": "Halving volume doubles its average density from ¾ to 1½ of water density, while also halving fully submerged buoyancy."
      },
      {
        "id": "rises",
        "text": "It rises because the same material was initially lighter than water",
        "feedback": "Average density includes the body’s exterior volume, which has changed; material identity alone does not settle flotation."
      },
      {
        "id": "neutral",
        "text": "It stays suspended because the mass is unchanged",
        "feedback": "Buoyancy depends on displaced volume as well as water density, so unchanged mass does not preserve force balance."
      }
    ],
    "answer": "sinks",
    "hints": [
      "Density is mass divided by volume. What happens to the ratio when only volume halves?",
      "Three-quarters doubled is greater than one.",
      "For a fully submerged body, buoyancy is proportional to exterior volume; weight is unchanged."
    ],
    "explanation": [
      "With fixed mass and half the volume, the body’s average density doubles.",
      "It changes from three-quarters of water density to one-and-a-half times water density.",
      "The smaller body displaces half as much water when fully submerged, so buoyancy is halved while weight remains the same.",
      "Its weight is now greater than buoyancy, giving a downward acceleration at release."
    ],
    "changes": "The answer depends on how much volume is lost. If the body can re-expand after release, or water enters, its mass-to-volume ratio may change again.",
    "sources": [
      {
        "title": "OpenStax University Physics, 14.1: Density and Pressure",
        "url": "https://openstax.org/books/university-physics-volume-1/pages/14-1-fluids-density-and-pressure"
      },
      {
        "title": "OpenStax University Physics, 14.4: Archimedes’ Principle and Buoyancy",
        "url": "https://openstax.org/books/university-physics-volume-1/pages/14-4-archimedes-principle-and-buoyancy"
      }
    ],
    "variation": {
      "prompt": "Instead compress the original body only to three-quarters of its original volume, keeping mass fixed and locking that new volume. In the same ideal uniform water, what happens when it is released motionless and fully submerged?",
      "conditions": [
        "Keep the original average density of three-quarters of water density.",
        "The new volume and mass stay fixed; there are no other forces."
      ],
      "check": {
        "constant": "Mass stays fixed; final volume is three-quarters of the original.",
        "forces": "Compare weight with the weight of displaced water.",
        "equilibrium": "Neutral buoyancy requires equal average body and water densities."
      },
      "hints": [
        "Divide the original density by the remaining volume fraction.",
        "The two factors of three-quarters cancel."
      ],
      "options": [
        {
          "id": "neutral",
          "text": "It is neutrally buoyant in this model",
          "feedback": "Its average density becomes equal to water density."
        },
        {
          "id": "sinks",
          "text": "It sinks because any compression makes it denser than water",
          "feedback": "Density increases, but this amount brings it exactly to water density rather than beyond."
        },
        {
          "id": "rises",
          "text": "It rises because its mass did not change",
          "feedback": "The displaced volume has changed; at this volume the buoyant force just equals weight."
        }
      ],
      "answer": "neutral",
      "explanation": [
        "Final density is original density divided by three-quarters, exactly water density.",
        "Buoyancy equals weight. Released motionless under these ideal conditions, it has no initial acceleration and can remain suspended."
      ]
    }
  }
];
  QUESTIONS.push(...DAILY_QUESTIONS);

  return QUESTIONS;
});
