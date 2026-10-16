## Modification: Depth-Aware Head Tracking, Face Orientation, and Constrained Root Motion

Modify the existing IK-based character rig to support natural forward-and-backward head movement relative to the webcam, while maintaining proper facial orientation toward the user. Preserve the existing two-spine-segment, neck, and head IK system. Do not replace or break the current IK implementation.

### 1. Head Depth Tracking

Allow the head to move forward and backward along the character's local forward/backward axis within a reasonable, configurable range.

* When the user's face moves closer to the webcam, the character's head should move forward naturally.
* When the user's face moves farther away from the webcam, the character's head should move backward naturally.
* Use the webcam tracking data to determine relative depth, with configurable minimum and maximum displacement.
* Apply smoothing and damping to prevent jitter, sudden jumps, or excessive movement caused by noisy facial tracking.
* Keep the head's movement proportional to the user's actual movement, with adjustable sensitivity and limits.

The movement must feel like the character is naturally leaning toward or away from the user, rather than simply translating the head independently of the body.

### 2. Facial Orientation Stabilization

The face must remain naturally oriented toward the webcam user as the head moves forward or backward.

* Maintain a stable, user-facing orientation while allowing the head to move through its permitted depth range.
* Preserve natural head yaw, pitch, and roll tracking from the existing system.
* Compensate for unwanted orientation changes caused by head translation or the IK solver.
* Prevent the face from tilting, twisting, or pointing away from the user when the head moves forward or backward.
* Use configurable orientation influence and rotation limits so the face remains stable without appearing unnaturally locked in place.

**Important:** Stabilize the face's orientation, not its position. The head must still move in depth, and the neck and spine must continue to articulate naturally to support it.

### 3. Spine and Neck IK Adaptation

The existing IK chain must adapt to the head's new positional movement.

* Recalculate the neck and both spine segments whenever the head's target position changes.
* Allow the neck and spine to bend and extend naturally to accommodate forward and backward head movement.
* Distribute positional and rotational adjustments across the chain instead of forcing all movement into the neck or a single spine segment.
* Preserve the existing rotation weights, joint limits, and smooth follow-through wherever possible.
* Prevent excessive stretching, collapsing, twisting, or unnatural joint angles.
* Maintain a continuous, anatomically plausible connection between the root, spine, neck, and head.

The IK solver must account for both the head's position and its desired orientation. Do not allow the positional target and rotational target to fight against one another.

### 4. Constrained Root Movement

The character's root must remain mostly stationary.

* Allow only subtle root translation in response to the head's movement.
* Permit a small, configurable range of movement along the ground plane (the character's local horizontal axes).
* Keep vertical root movement disabled or tightly constrained unless required by the existing rig.
* Do not allow the root to follow the head's forward and backward depth movement directly.
* Use the spine and neck as the primary mechanisms for accommodating head displacement.
* Apply smooth damping and configurable movement limits to the root so it never chases the head or causes the entire character to slide around.

The root should provide only subtle supporting movement when necessary, while the spine, neck, and head handle the majority of the articulation.

### 5. Movement Priority and Constraint Handling

Maintain the following hierarchy of responsibilities:

1. **Head:** Tracks the user's position and orientation, including limited forward and backward depth movement.
2. **Neck:** Adapts to head position and orientation while maintaining a natural connection to the upper spine.
3. **Upper spine:** Supports the neck and distributes head movement into the torso.
4. **Lower spine:** Provides subtle counterbalancing and distributes movement without excessive bending.
5. **Root:** Remains stable, allowing only small, bounded ground-plane adjustments.

Resolve the head's positional and rotational targets together so that satisfying one constraint does not break another. If the requested movement exceeds the rig's permitted range, clamp the movement gracefully rather than allowing the skeleton to deform unnaturally.

### 6. Technical Requirements

* Extend the existing implementation rather than rebuilding it from scratch.
* Use the existing rig hierarchy, coordinate system, and IK solver.
* Keep all depth ranges, root movement limits, rotation limits, smoothing values, and influence weights configurable.
* Use stable target transforms and appropriate update ordering to prevent feedback loops or oscillation.
* Ensure all movement updates continuously and smoothly in real time.
* Preserve the existing side-to-side and rotational head tracking behavior.

### Expected Result

The character should behave like a person sitting in front of a webcam. When the user leans toward the camera, the character's head moves forward while the face remains appropriately oriented toward the user. The neck and two spine segments adjust naturally to support the movement, while the root remains nearly stationary with only subtle ground-plane motion. When the user leans backward, the entire chain reverses the movement smoothly.

The final result must feel like a cohesive, connected skeletal rig rather than a head moving independently on top of a stationary body.
